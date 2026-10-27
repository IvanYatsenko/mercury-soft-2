import { performance } from 'node:perf_hooks';
import {
  buildProfilePlan,
  buildRunPlan,
  targetAt,
  type Profile,
  type ProfilePlan,
  type RunStatus,
  heatOutputs,
} from '@mercury/shared';
import { config } from './config.js';
import {
  getOvenModel,
  readOvenSelection,
  readThermalSettings,
  getProfileRates,
  getMeasuredResponse,
  readKeepHeatEnabled,
  readProtectionLimits,
} from './ovenSettings.js';
import {
  createRun,
  addRunEvent,
  addRunSample,
  finishRun,
  checkpointDatabase,
} from './database.js';
import {
  readProfileController,
  applyProfileOutputs,
  setProfileControl,
  initializeControllerConnection,
  playBoardCompletionSound,
  playBoardErrorSound,
  setDoorWarning,
} from './controller/checkControllerConnection.js';
import { virtualBoard } from './controller/virtualBoard.js';
import { ThermalRegulator, type ThermalOutputs } from './thermalRegulator.js';
import { predictionHorizonSeconds } from './predictiveHeat.js';

export class ProfileRunner {
  constructor(
    private readonly clock = () => performance.now(),
    private readonly manual = false,
  ) {}
  async step() {
    if (!this.manual)
      throw new Error('Manual stepping is only available with a manual clock.');
    await this.tick();
  }
  async failFromMonitor(message: string) {
    if (this.holding) {
      this.holding = false;
      this.pendingReady = false;
      clearTimeout(this.timer);
      await this.operation;
      await this.failHolding(message);
      return;
    }
    if (!this.active()) return;
    this.stopped = true;
    clearTimeout(this.timer);
    await this.operation;
    if (this.active()) await this.finish('failed', message);
  }
  private coolAfterStop = false;
  private boundary50 = false;
  private doorOpen = false;
  private pausedAt: number | null = null;
  private pauseChanging = false;
  async startTemperatureHold() {
    if (this.status.state === 'failed' || this.status.error)
      throw new Error('Сначала устрани ошибку печи.');
    if (this.active() || this.holding || !readKeepHeatEnabled())
      throw new Error('Поддержание сейчас недоступно.');
    await initializeControllerConnection();
    const board = await readProfileController();
    if (
      board.doorOpen ||
      !board.ready ||
      !board.telemetry ||
      board.telemetry.chamberTemperatureC == null ||
      board.telemetry.boardTemperatureC == null ||
      board.telemetry.chamberTemperatureC < 0 ||
      board.telemetry.boardTemperatureC < 0 ||
      board.telemetry.chamberTemperatureC >=
        readProtectionLimits().maximumTemperatureC ||
      board.telemetry.boardTemperatureC >=
        readProtectionLimits().maximumTemperatureC
    )
      throw new Error('Плата не готова к поддержанию.');
    this.powerBudgetW =
      readOvenSelection()?.connectionVoltage === '380' ? Infinity : 2200;
    this.beginHolding();
    this.schedule();
    return this.snapshot();
  }
  async pause() {
    if (this.pauseChanging || this.starting || !this.active())
      throw new Error('Профиль нельзя поставить на паузу.');
    if (this.pausedAt !== null) return this.snapshot();
    this.pauseChanging = true;
    try {
      await this.operation;
      if (!this.active() || this.stopped)
        throw new Error('Профиль уже завершён.');
      this.pausedAt = this.clock();
      this.heating = false;
      this.cooling = false;
      for (const name of heatOutputs) this.heatChannels[name] = false;
      try {
        await applyProfileOutputs(false, false, this.heatChannels);
      } catch (error) {
        await this.finish('failed', String(error));
        throw error;
      }
      if (this.status.id)
        addRunEvent(this.status.id, 'Пауза: отсчёт и нагрев остановлены.');
      return this.snapshot();
    } finally {
      this.pauseChanging = false;
    }
  }
  async resume() {
    if (this.pauseChanging || !this.active() || this.pausedAt === null)
      throw new Error('Профиль не находится на паузе.');
    this.pauseChanging = true;
    try {
      await this.operation;
      if (!this.active() || this.stopped)
        throw new Error('Профиль уже завершён.');
      const now = this.clock();
      this.phaseStartedAt += now - this.pausedAt!;
      this.pausedAt = null;
      this.previous = now;
      if (this.warmStartUntil !== null) this.warmStartUntil = now + 5000;
      this.regulator?.reset();
      if (this.status.id)
        addRunEvent(this.status.id, 'Продолжение после паузы.');
      return this.snapshot();
    } finally {
      this.pauseChanging = false;
    }
  }
  private preparationCooling = false;
  private entryTemperature = 50;
  private entrySecond = 0;
  private warmStartUntil: number | null = null;
  private selectCycleEntry(measured: number, now: number, prime = true) {
    if (!this.boundary50 || !this.profile || !this.plan) return;
    const selection = readOvenSelection();
    const model = selection && getOvenModel(selection.ovenModel);
    if (!model) throw new Error('Не выбрана печь.');
    const rates = getProfileRates(model);
    const trimmed = buildRunPlan(
      this.profile,
      rates.heatingRate,
      rates.coolingRate,
      measured,
    );
    this.entryTemperature = trimmed.points[0]!.temperature;
    this.entrySecond = this.plan.durationSeconds - trimmed.durationSeconds;
    this.currentSecond = this.entrySecond;
    this.totalSecond += this.entrySecond;
    this.phaseStartedAt = now - this.entrySecond * 1000;
    this.preparationCooling = measured > this.entryTemperature;
    this.status.state =
      measured < this.entryTemperature || this.preparationCooling
        ? 'preparing'
        : 'running';
    this.status.targetTemperatureC = this.entryTemperature;
    this.status.elapsedSeconds = Math.round(this.totalSecond);
    this.status.remainingSeconds = Math.ceil(
      this.plan.durationSeconds * (this.plan.cycles - this.status.cycle + 1) -
        this.entrySecond,
    );
    // A warm sensor does not mean the lamps/heaters have already responded.
    // Prepare them before running the clock, then remap to the actual first ramp.
    this.warmStartUntil =
      prime &&
      measured > 50 &&
      !this.preparationCooling &&
      (trimmed.points[1]?.temperature ?? measured) - measured > 5
        ? now + 5000
        : null;
    if (this.warmStartUntil !== null) {
      this.status.state = 'preparing';
      if (this.status.id)
        addRunEvent(
          this.status.id,
          'Подготовка нагрева перед горячим стартом: 5 секунд; отсчёт ещё не идёт.',
        );
    }
    if (this.status.id && this.entrySecond > 0 && this.warmStartUntil === null)
      addRunEvent(
        this.status.id,
        `Вход в первую полку с ${this.entryTemperature} °C; пропущено ${this.entrySecond.toFixed(1)} с графика.`,
      );
    if (this.status.state === 'preparing') this.phaseStartedAt = now;
  }
  private pendingReady = false;
  private holding = false;
  private holdingRegulator: ThermalRegulator | null = null;
  private holdingWarmupRegulator: ThermalRegulator | null = null;
  private holdingWarmup = false;
  private holdingWarmSince: number | null = null;
  controlling() {
    return this.active() || this.holding;
  }
  async disableKeepHeat() {
    this.pendingReady = false;
    this.holdAfterCompletionSound = false;
    if (this.holding) await this.stop();
  }
  async startProfile(profile: Profile) {
    if (this.active()) throw new Error('Профиль уже выполняется.');
    if (this.holding) await this.stop();
    return this.start(profile, false, true);
  }
  async acknowledgeReady(runId: unknown) {
    if (runId !== this.status.id || this.active())
      throw new Error('Испытание уже изменилось или ещё выполняется.');
    if (this.pendingReady && readKeepHeatEnabled()) {
      if (this.finishingSound) this.holdAfterCompletionSound = true;
      else {
        this.beginHolding();
        this.schedule();
      }
    }
    this.pendingReady = false;
    return this.snapshot();
  }
  private beginHolding() {
    if (
      config.controllerMode === 'hardware' &&
      config.hardwareTemperatureLimit < 100
    )
      throw new Error('Предел испытаний ниже температуры поддержания 100 °C.');
    const model = getOvenModel(readOvenSelection()!.ovenModel)!;
    this.holdingRegulator = new ThermalRegulator(
      { ...readThermalSettings(), mode: 'heaters' },
      model.specifications.maximumHeatingRateCPerSecond,
      model.specifications.maximumCoolingRateCPerSecond,
      heatOutputs.filter((name) => name in model.outputs.singlePhase),
      getMeasuredResponse(model)?.temperatureBands,
    );
    const thermal = readThermalSettings();
    this.holdingWarmupRegulator = new ThermalRegulator(
      {
        ...thermal,
        mode: thermal.mode === 'combined' ? 'combined' : 'heaters',
      },
      model.specifications.maximumHeatingRateCPerSecond,
      model.specifications.maximumCoolingRateCPerSecond,
      heatOutputs.filter((name) => name in model.outputs.singlePhase),
      getMeasuredResponse(model)?.temperatureBands,
    );
    this.holdingWarmup = false;
    this.holding = true;
    this.holdingWarmSince = null;
    this.coolAfterStop = false;
    this.previous = this.clock();
    setProfileControl(true);
    if (this.status.id)
      addRunEvent(this.status.id, 'Поддержание 100 °C включено.');
  }
  private coolingUntil = 0;
  async resetIdleOutputs(temperature: number) {
    this.coolAfterStop = temperature > 50 || this.clock() < this.coolingUntil;
    await applyProfileOutputs(false, this.coolAfterStop);
    this.needsOutputReset = false;
  }
  async updateIdleCooling(temperature: number | null | undefined) {
    if (this.holding) return;
    if (
      !this.active() &&
      this.coolAfterStop &&
      this.clock() >= this.coolingUntil &&
      temperature != null &&
      temperature <= 50
    ) {
      await applyProfileOutputs(false, false);
      this.coolAfterStop = false;
    }
  }
  private profile: Profile | null = null;
  private plan: ProfilePlan | null = null;
  private currentSecond = 0;
  private totalSecond = 0;
  private previous = 0;
  private heating = false;
  private heatChannels: ThermalOutputs = {
    topHeater: false,
    bottomHeater: false,
    infrared: false,
    infrared2: false,
    infrared3: false,
    cooling: false,
  };
  private regulator: ThermalRegulator | null = null;
  private powerBudgetW = Infinity;
  private profileMatched = true;
  private cycleMatched = true;
  private maximumDeviationC = 0;
  private finishingSound = false;
  private holdAfterCompletionSound = false;
  private maximumResponse = false;
  private testCooling = false;
  private testLampIndex = 0;
  private testTargetTemperatureC = 100;
  private testLimitTemperatureC = 105;
  private testTimeoutSeconds = 1200;

  async startMaximumResponseTest(targetTemperatureC: unknown = 100) {
    if (
      typeof targetTemperatureC !== 'number' ||
      ![100, 150, 200, 250, 260, 270].includes(targetTemperatureC)
    )
      throw new Error(
        'Допустимые температуры испытания: 100, 150, 200, 250, 260, 270 °C.',
      );
    if (readThermalSettings().mode !== 'combined')
      throw new Error('Для испытания требуется совместный режим.');
    return this.start(
      {
        name: `Максимальный нагрев ${targetTemperatureC} → 50 °C`,
        mode: 'manual',
        board: false,
        points: [
          { second: 0, temperature: 30 },
          {
            second: Math.ceil((targetTemperatureC - 30) / 0.7),
            temperature: targetTemperatureC,
          },
          {
            second: Math.ceil((targetTemperatureC - 50) / 0.4),
            temperature: 50,
          },
        ],
        shelves: [
          { second: 0, temperature: 30 },
          { second: 0, temperature: targetTemperatureC },
          { second: 0, temperature: 50 },
        ],
      },
      true,
    );
  }
  private cooling = false;
  private hottestTemperature = 0;
  private stopped = false;
  private operation: Promise<void> = Promise.resolve();
  private phaseStartedAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private starting = false;
  needsOutputReset = true;
  private status: RunStatus = {
    id: null,
    state: 'idle',
    profileName: null,
    cycle: 0,
    cycles: 0,
    stage: 0,
    elapsedSeconds: 0,
    remainingSeconds: 0,
    targetTemperatureC: null,
    measuredTemperatureC: null,
    error: null,
  };
  snapshot() {
    return {
      ...this.status,
      paused: this.pausedAt !== null,
      doorOpen: this.doorOpen,
      holdingTemperatureC: this.holding ? 100 : null,
      pendingReady: this.pendingReady,
      canAcknowledge: !this.active(),
    };
  }
  active() {
    return (
      this.starting ||
      this.status.state === 'preparing' ||
      this.status.state === 'running' ||
      this.status.state === 'cooling'
    );
  }

  async start(profile: Profile, maximumResponse = false, prepare50 = false) {
    if (this.holding) throw new Error('Останови поддержание перед запуском.');
    if (this.active()) throw new Error('Профиль уже выполняется.');
    if (this.finishingSound)
      throw new Error('Дождись окончания звукового сигнала.');
    const selection = readOvenSelection();
    const model = selection && getOvenModel(selection.ovenModel);
    if (!model) throw new Error('Выбери модель печи.');
    const rates = getProfileRates(model);
    const plan = (prepare50 ? buildRunPlan : buildProfilePlan)(
      profile,
      rates.heatingRate,
      rates.coolingRate,
    );
    if (plan.maximumTemperatureC > model.specifications.maximumTemperatureC)
      throw new Error('Температура превышает предел печи.');
    if (
      config.controllerMode === 'hardware' &&
      plan.maximumTemperatureC > config.hardwareTemperatureLimit
    )
      throw new Error(
        `На текущем этапе испытаний допустимы профили до ${config.hardwareTemperatureLimit} °C.`,
      );
    const thermal = readThermalSettings();
    this.powerBudgetW =
      selection?.connectionVoltage === '380' ? Infinity : 220 * 10;
    if (config.controllerMode === 'hardware') {
      const enabled = Object.entries(thermal.powersW).filter(
        ([name]) =>
          name in model.outputs.singlePhase &&
          (thermal.mode === 'combined' ||
            (thermal.mode === 'lamps'
              ? name.startsWith('infrared')
              : !name.startsWith('infrared'))),
      );
      if (enabled.some(([, power]) => power <= 0))
        throw new Error(
          'Не заданы мощности нагревательных нагрузок для выбранного режима.',
        );
      if (
        enabled.some(
          ([name, power]) =>
            !name.startsWith('infrared') &&
            thermal.mode !== 'combined' &&
            power + thermal.auxiliaryPowerW > this.powerBudgetW,
        )
      )
        throw new Error(
          'Отдельная нагрузка с вспомогательными потребителями превышает предел 10 А.',
        );
    }
    this.regulator = new ThermalRegulator(
      thermal,
      model.specifications.maximumHeatingRateCPerSecond,
      model.specifications.maximumCoolingRateCPerSecond,
      heatOutputs.filter((name) => name in model.outputs.singlePhase),
      profile.board ? undefined : getMeasuredResponse(model)?.temperatureBands,
    );
    this.starting = true;
    this.boundary50 = prepare50;
    this.warmStartUntil = null;
    this.pendingReady = false;
    this.maximumResponse = maximumResponse;
    this.testTargetTemperatureC = profile.points[1]?.temperature ?? 100;
    this.testLimitTemperatureC =
      this.testTargetTemperatureC === 100
        ? 105
        : Math.min(280, this.testTargetTemperatureC + 10);
    this.testTimeoutSeconds = this.testTargetTemperatureC === 100 ? 1200 : 1800;
    this.testCooling = false;
    this.testLampIndex = 0;
    this.profileMatched = true;
    this.cycleMatched = true;
    this.maximumDeviationC = 0;
    this.stopped = false;
    this.pausedAt = null;
    this.status = {
      id: null,
      state: 'idle',
      profileName: profile.name,
      cycle: 0,
      cycles: plan.cycles,
      stage: 0,
      elapsedSeconds: 0,
      remainingSeconds: plan.durationSeconds * plan.cycles,
      targetTemperatureC: null,
      measuredTemperatureC: null,
      error: null,
    };
    try {
      await initializeControllerConnection();
      setProfileControl(true);
      const board = await readProfileController();
      if (this.stopped) throw new Error('Запуск прерван.');
      if (board.doorOpen) throw new Error('Закрой дверь печи.');
      this.doorOpen = false;
      const temperature = profile.board
        ? board.telemetry?.boardTemperatureC
        : board.telemetry?.chamberTemperatureC;
      if (
        temperature == null ||
        (Math.max(
          board.telemetry?.boardTemperatureC ?? Infinity,
          board.telemetry?.chamberTemperatureC ?? Infinity,
        ) > 50 &&
          !prepare50)
      )
        throw new Error(
          'Перед запуском температура должна быть не выше 50 °C.',
        );
      await applyProfileOutputs(false, false);
      if (this.stopped) throw new Error('Запуск прерван.');
      this.profile = structuredClone(profile);
      this.plan = plan;
      this.currentSecond = 0;
      this.totalSecond = 0;
      this.heating = false;
      this.cooling = false;
      this.previous = this.clock();
      this.hottestTemperature = Math.max(
        board.telemetry?.boardTemperatureC ?? 0,
        board.telemetry?.chamberTemperatureC ?? 0,
      );
      this.preparationCooling = temperature > 50;
      this.phaseStartedAt = this.previous;
      this.status = {
        id: createRun(profile, config.controllerMode === 'simulation', plan),
        state: prepare50 && temperature !== 50 ? 'preparing' : 'running',
        profileName: profile.name,
        cycle: 1,
        cycles: plan.cycles,
        stage: 1,
        elapsedSeconds: 0,
        remainingSeconds: plan.durationSeconds * plan.cycles,
        targetTemperatureC: plan.points[0]!.temperature,
        measuredTemperatureC: temperature,
        error: null,
      };
      this.needsOutputReset = false;
      if (maximumResponse)
        addRunEvent(
          this.status.id!,
          `Испытание максимальной скорости: М${selection!.ovenModel}, ${selection!.connectionVoltage} В, оба ТЭНа и ${selection!.connectionVoltage === '380' ? 'все пары ламп вместе' : 'чередование пар ламп'} до ${this.testTargetTemperatureC} °C; затем непрерывное охлаждение до 50 °C. Завершение по температуре; предельное время ${this.testTimeoutSeconds / 60} минут.`,
        );
      this.selectCycleEntry(temperature, this.previous);
      this.schedule();
      return this.snapshot();
    } catch (error) {
      setProfileControl(false);
      throw error;
    } finally {
      this.starting = false;
    }
  }
  private schedule() {
    if (this.manual) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.operation = this.tick().finally(() => {
        if ((this.active() && !this.stopped) || this.holding) this.schedule();
      });
    }, 1000);
  }
  private async tick() {
    if (this.holding) {
      await this.tickHolding();
      return;
    }
    if (!this.active() || !this.plan || !this.profile || this.stopped) return;
    const now = this.clock();
    const dt = (now - this.previous) / 1000;
    this.previous = now;
    try {
      if (dt > 5) throw new Error('Задержка управления более 5 секунд.');
      if (config.controllerMode === 'simulation')
        virtualBoard.advance(
          dt,
          this.heating,
          this.cooling,
          (Number(this.heatChannels.topHeater) +
            Number(this.heatChannels.bottomHeater) +
            Number(this.heatChannels.infrared) +
            Number(this.heatChannels.infrared2) +
            Number(this.heatChannels.infrared3)) /
            2,
        );
      const board = await readProfileController();
      if (this.stopped) return;
      const wasOpen = this.doorOpen;
      this.doorOpen = board.doorOpen;
      if (this.boundary50) {
        if (this.doorOpen) {
          this.heating = false;
          for (const name of heatOutputs) this.heatChannels[name] = false;
          await applyProfileOutputs(false, this.cooling, this.heatChannels);
          if (this.stopped) return;
        }
        setDoorWarning(this.doorOpen);
        if (wasOpen && !this.doorOpen) this.regulator?.reset();
        if (wasOpen !== this.doorOpen && this.status.id)
          addRunEvent(
            this.status.id,
            this.doorOpen
              ? 'Дверь открыта: нагрев выключен, таймер продолжается.'
              : 'Дверь закрыта: возврат к текущей точке графика.',
          );
      }
      const t1 = board.telemetry?.boardTemperatureC,
        t2 = board.telemetry?.chamberTemperatureC;
      this.hottestTemperature = Math.max(
        t1 ?? this.hottestTemperature,
        t2 ?? this.hottestTemperature,
      );
      if (
        t1 == null ||
        t2 == null ||
        t1 < 0 ||
        t2 < 0 ||
        t1 >= readProtectionLimits().maximumTemperatureC ||
        t2 >= readProtectionLimits().maximumTemperatureC
      )
        throw new Error('Ошибка датчика или перегрев.');
      if (
        config.controllerMode === 'hardware' &&
        this.hottestTemperature > config.hardwareTemperatureLimit
      )
        throw new Error(
          `Превышен предел испытаний ${config.hardwareTemperatureLimit} °C.`,
        );
      if (board.doorOpen && !this.boundary50)
        throw new Error('Дверь открыта. Нагрев остановлен.');
      // Fan speed is advisory; temperature and board faults remain interlocks.
      const measured = this.profile.board ? t1 : t2;
      if (this.pausedAt !== null) {
        this.status.measuredTemperatureC = measured;
        await applyProfileOutputs(false, false, this.heatChannels);
        return;
      }
      if (this.status.state === 'preparing') {
        if (now - this.phaseStartedAt > 1800000)
          throw new Error('Подготовка до 50 °C превысила 30 минут.');
        if (this.doorOpen) {
          if (this.warmStartUntil !== null) this.warmStartUntil = now + 5000;
          this.heatChannels = {
            topHeater: false,
            bottomHeater: false,
            infrared: false,
            infrared2: false,
            infrared3: false,
            cooling: this.preparationCooling,
          };
          this.heating = false;
          this.cooling = this.preparationCooling;
          await applyProfileOutputs(false, this.cooling, this.heatChannels);
          this.status = { ...this.status, measuredTemperatureC: measured };
          return;
        }
        if (this.warmStartUntil !== null) {
          if (measured > this.entryTemperature + 30)
            throw new Error('Перегрев при подготовке горячего старта.');
          if (now >= this.warmStartUntil) {
            this.totalSecond -= this.entrySecond;
            this.selectCycleEntry(measured, now, false);
            addRunEvent(
              this.status.id!,
              'Нагрев подготовлен; старт синхронизирован с фактической температурой первой полки.',
            );
          }
          const entry = targetAt(this.plan, this.entrySecond);
          const channels = this.preparationCooling
            ? {
                topHeater: false,
                bottomHeater: false,
                infrared: false,
                infrared2: false,
                infrared3: false,
                cooling: true,
              }
            : this.regulator!.step(
                measured,
                this.entryTemperature,
                targetAt(this.plan, this.entrySecond + predictionHorizonSeconds)
                  .temperature,
                entry.slope,
                dt,
                this.powerBudgetW,
              );
          this.heatChannels = channels;
          this.heating = heatOutputs.some((name) => channels[name]);
          this.cooling = channels.cooling;
          await applyProfileOutputs(this.heating, this.cooling, channels);
          this.status.measuredTemperatureC = measured;
          return;
        }
        if (this.preparationCooling && measured <= this.entryTemperature)
          this.preparationCooling = false;
        if (!this.preparationCooling && measured > this.entryTemperature + 30)
          throw new Error('Перегрев при подготовке до 50 °C.');
        if (!this.preparationCooling && measured >= this.entryTemperature) {
          await applyProfileOutputs(false, false);
          this.phaseStartedAt = now - this.entrySecond * 1000;
          this.previous = now;
          this.regulator!.reset();
          this.heatChannels = {
            topHeater: false,
            bottomHeater: false,
            infrared: false,
            infrared2: false,
            infrared3: false,
            cooling: false,
          };
          this.heating = false;
          this.cooling = false;
          this.status = {
            ...this.status,
            state: 'running',
            targetTemperatureC: this.entryTemperature,
            measuredTemperatureC: measured,
          };
          addRunEvent(
            this.status.id!,
            `Достигнуты ${this.entryTemperature} °C; начат отсчёт профиля.`,
          );
        } else {
          const channels = this.preparationCooling
            ? {
                topHeater: false,
                bottomHeater: false,
                infrared: false,
                infrared2: false,
                infrared3: false,
                cooling: true,
              }
            : this.regulator!.step(
                measured,
                this.entryTemperature,
                this.entryTemperature,
                0,
                dt,
                this.powerBudgetW,
              );
          if (measured > this.entryTemperature + 30 && !channels.cooling)
            throw new Error('Перегрев при подготовке до 50 °C.');
          this.heatChannels = channels;
          this.heating = heatOutputs.some((name) => channels[name]);
          this.cooling = channels.cooling;
          await applyProfileOutputs(this.heating, this.cooling, channels);
          this.status = {
            ...this.status,
            targetTemperatureC: 50,
            measuredTemperatureC: measured,
          };
        }
        return;
      }
      this.totalSecond += dt;
      if (this.maximumResponse) {
        if (this.hottestTemperature > this.testLimitTemperatureC)
          throw new Error(
            `Превышен аварийный предел испытания ${this.testLimitTemperatureC} °C.`,
          );
        if (this.totalSecond > this.testTimeoutSeconds)
          throw new Error(
            `Испытание превысило ${this.testTimeoutSeconds / 60} минут.`,
          );
        if (!this.testCooling && measured >= this.testTargetTemperatureC) {
          this.testCooling = true;
          addRunEvent(
            this.status.id!,
            `Нагрев выключен при ${measured} °C через ${this.totalSecond.toFixed(1)} с; начало охлаждения.`,
          );
        }
        const model = getOvenModel(readOvenSelection()!.ovenModel)!;
        const lamps = heatOutputs.filter(
          (name) =>
            name.startsWith('infrared') && name in model.outputs.singlePhase,
        );
        if (!lamps.length) throw new Error('Не найдены выходы ламп.');
        const channels: ThermalOutputs = {
          topHeater: !this.testCooling,
          bottomHeater: !this.testCooling,
          infrared: false,
          infrared2: false,
          infrared3: false,
          cooling: this.testCooling && this.hottestTemperature > 50,
        };
        if (!this.testCooling) {
          if (readOvenSelection()!.connectionVoltage === '380') {
            for (const lamp of lamps) channels[lamp] = true;
          } else channels[lamps[this.testLampIndex++ % lamps.length]!] = true;
        }
        this.heatChannels = channels;
        this.heating = !this.testCooling;
        this.cooling = channels.cooling;
        await applyProfileOutputs(this.heating, this.cooling, channels);
        if (this.stopped) return;
        addRunSample(this.status.id!, {
          elapsedSeconds: Math.round(this.totalSecond * 10) / 10,
          targetTemperatureC: this.testCooling
            ? 50
            : this.testTargetTemperatureC,
          chamberTemperatureC: t2,
          boardTemperatureC: t1,
          heating: this.heating,
          heatOutputs: channels,
          cooling: this.cooling,
          cycle: 1,
        });
        this.status = {
          ...this.status,
          state: this.testCooling ? 'cooling' : 'running',
          stage: this.testCooling ? 2 : 1,
          elapsedSeconds: Math.round(this.totalSecond),
          remainingSeconds: 0,
          measuredTemperatureC: measured,
          targetTemperatureC: this.testCooling
            ? 50
            : this.testTargetTemperatureC,
        };
        if (this.testCooling && this.hottestTemperature <= 50) {
          addRunEvent(
            this.status.id!,
            `Охлаждение до 50 °C завершено через ${this.totalSecond.toFixed(1)} с от начала испытания.`,
          );
          await this.finish('completed', null);
        }
        return;
      }
      this.currentSecond = Math.min(
        (now - this.phaseStartedAt) / 1000,
        this.plan.durationSeconds,
      );
      const target =
        this.status.state === 'cooling'
          ? {
              temperature: Math.min(50, this.plan.points.at(-1)!.temperature),
              slope: -0.4,
              stage: this.plan.points.length - 1,
            }
          : targetAt(this.plan, this.currentSecond);
      if (
        this.status.state === 'running' &&
        measured > Math.max(70, target.temperature + 30)
      )
        throw new Error('Температура существенно превышает заданную.');
      if (now - this.phaseStartedAt > (this.plan.durationSeconds + 1800) * 1000)
        throw new Error('Превышено время выполнения цикла.');
      const deviation = Math.abs(measured - target.temperature);
      this.maximumDeviationC = Math.max(this.maximumDeviationC, deviation);
      if (deviation > 4) {
        this.profileMatched = false;
        this.cycleMatched = false;
      }
      const futureTarget = targetAt(
        this.plan,
        this.currentSecond + predictionHorizonSeconds,
      ).temperature;
      this.heatChannels = this.regulator!.step(
        measured,
        target.temperature,
        futureTarget,
        target.slope,
        dt,
        this.powerBudgetW,
        this.status.state === 'cooling',
      );
      if (this.doorOpen)
        for (const name of heatOutputs) this.heatChannels[name] = false;
      this.cooling = this.heatChannels.cooling;
      this.heating =
        this.heatChannels.topHeater ||
        this.heatChannels.bottomHeater ||
        this.heatChannels.infrared ||
        this.heatChannels.infrared2 ||
        this.heatChannels.infrared3;
      await applyProfileOutputs(this.heating, this.cooling, this.heatChannels);
      if (this.stopped) return;
      addRunSample(this.status.id!, {
        elapsedSeconds: Math.round(this.totalSecond * 10) / 10,
        targetTemperatureC: target.temperature,
        chamberTemperatureC: t2,
        boardTemperatureC: t1,
        heating: this.heating,
        heatOutputs: {
          topHeater: this.heatChannels.topHeater,
          bottomHeater: this.heatChannels.bottomHeater,
          infrared: this.heatChannels.infrared,
          infrared2: this.heatChannels.infrared2,
          infrared3: this.heatChannels.infrared3,
        },
        cooling: this.cooling,
        cycle: this.status.cycle,
      });
      this.status = {
        ...this.status,
        stage: target.stage,
        elapsedSeconds: Math.round(this.totalSecond),
        remainingSeconds: Math.ceil(
          this.plan.durationSeconds * (this.plan.cycles - this.status.cycle) +
            this.plan.durationSeconds -
            this.currentSecond,
        ),
        targetTemperatureC: target.temperature,
        measuredTemperatureC: measured,
      };
      if (this.currentSecond >= this.plan.durationSeconds) {
        if (this.status.cycle < this.plan.cycles) {
          await applyProfileOutputs(false, this.cooling);
          this.heating = false;
          for (const name of heatOutputs) this.heatChannels[name] = false;
          try {
            await playBoardCompletionSound(this.cycleMatched);
          } catch (error) {
            addRunEvent(
              this.status.id!,
              `Не удалось подать сигнал цикла: ${String(error)}`,
            );
          }
          if (this.stopped) return;
          this.cycleMatched = true;
          this.previous = this.clock();
          this.status.cycle++;
          this.currentSecond = 0;
          this.phaseStartedAt = this.previous;
          if (this.boundary50) this.status.state = 'preparing';
          this.preparationCooling = measured > 50;
          const nextBoard = await readProfileController();
          if (this.stopped) return;
          const entry = this.profile.board
            ? nextBoard.telemetry?.boardTemperatureC
            : nextBoard.telemetry?.chamberTemperatureC;
          if (entry == null) throw new Error('Нет температуры перед повтором.');
          this.hottestTemperature = Math.max(
            nextBoard.telemetry?.boardTemperatureC ?? Infinity,
            nextBoard.telemetry?.chamberTemperatureC ?? Infinity,
          );
          this.selectCycleEntry(entry, this.previous);
          this.regulator?.reset();
          addRunEvent(this.status.id!, `Цикл ${this.status.cycle}`);
        } else {
          addRunEvent(
            this.status.id!,
            `Соответствие графику: ${this.profileMatched ? 'да' : 'нет'}; допуск ±4 °C; максимальное отклонение ${this.maximumDeviationC.toFixed(1)} °C`,
          );
          this.finishingSound = true;
          await this.finish('completed', null, true);
          if (this.status.state === 'completed') {
            try {
              await playBoardCompletionSound(this.cycleMatched);
            } catch (soundError) {
              addRunEvent(
                this.status.id!,
                `Не удалось подать сигнал завершения: ${String(soundError)}`,
              );
            }
            const holdRequested = this.holdAfterCompletionSound;
            this.holdAfterCompletionSound = false;
            if (holdRequested && readKeepHeatEnabled()) this.beginHolding();
          }
          this.finishingSound = false;
        }
      }
    } catch (error) {
      this.finishingSound = false;
      await this.finish(
        'failed',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  private async finish(
    state: 'completed' | 'stopped' | 'failed',
    error: string | null,
    deferHoldUntilCompletionSound = false,
  ) {
    this.pausedAt = null;
    setDoorWarning(false);
    const holdNow =
      (state === 'completed' || state === 'stopped') &&
      this.boundary50 &&
      readKeepHeatEnabled() &&
      (state === 'stopped' ||
        (this.plan?.points.at(-1)?.temperature ?? 0) >= 100);
    this.pendingReady =
      state === 'completed' &&
      this.boundary50 &&
      readKeepHeatEnabled() &&
      !holdNow;
    this.coolAfterStop = holdNow
      ? false
      : state !== 'completed' || this.hottestTemperature > 50;
    if (state !== 'completed') this.coolingUntil = this.clock() + 30000;
    try {
      await applyProfileOutputs(false, this.coolAfterStop);
      this.needsOutputReset = false;
    } catch (offError) {
      this.needsOutputReset = true;
      state = 'failed';
      error =
        (error ? error + '; ' : '') +
        'Нет подтверждения отключения нагрева: ' +
        String(offError);
    }
    this.heating = false;
    this.cooling = false;
    this.status = { ...this.status, state, error, remainingSeconds: 0 };
    try {
      if (this.status.id) finishRun(this.status.id, state, error);
      checkpointDatabase();
    } catch (storageError) {
      this.status = {
        ...this.status,
        state: 'failed',
        error: [error, `Не удалось записать результат: ${String(storageError)}`]
          .filter(Boolean)
          .join('; '),
      };
      console.error('Run storage failed:', storageError);
    } finally {
      setProfileControl(false);
    }
    if (this.status.state === 'failed') {
      try {
        await playBoardErrorSound();
      } catch (soundError) {
        console.warn('Сигнал ошибки:', String(soundError));
      }
    }
    if (holdNow && this.status.state === 'completed') {
      if (deferHoldUntilCompletionSound) this.holdAfterCompletionSound = true;
      else this.beginHolding();
    } else if (holdNow && this.status.state === 'stopped') {
      this.beginHolding();
    }
  }
  private async tickHolding() {
    const now = this.clock();
    const dt = (now - this.previous) / 1000;
    this.previous = now;
    try {
      if (dt > 5)
        throw new Error('Задержка управления поддержанием более 5 секунд.');
      if (config.controllerMode === 'simulation')
        virtualBoard.advance(
          dt,
          this.heating,
          this.cooling,
          heatOutputs.filter((name) => this.heatChannels[name]).length / 2,
        );
      const board = await readProfileController();
      if (!this.holding) return;
      const t1 = board.telemetry?.boardTemperatureC,
        t2 = board.telemetry?.chamberTemperatureC;
      if (
        t1 == null ||
        t2 == null ||
        !Number.isFinite(t1) ||
        !Number.isFinite(t2) ||
        t1 < 0 ||
        t2 < 0 ||
        t1 >= readProtectionLimits().maximumTemperatureC ||
        t2 >= readProtectionLimits().maximumTemperatureC
      )
        throw new Error('Ошибка датчика или перегрев при поддержании.');
      this.hottestTemperature = Math.max(t1, t2);
      if (t2 < 95) this.holdingWarmSince ??= now;
      else this.holdingWarmSince = null;
      if (
        this.holdingWarmSince !== null &&
        now - this.holdingWarmSince > 600000
      )
        throw new Error('Поддержание не достигло 95 °C за 10 минут.');
      if (
        config.controllerMode === 'hardware' &&
        this.hottestTemperature > config.hardwareTemperatureLimit
      )
        throw new Error('Превышен предел испытаний при поддержании.');
      if (board.doorOpen)
        throw new Error('Дверь открыта. Поддержание остановлено.');
      // Low fan speed warns in the UI without cancelling temperature holding.
      if (this.heating && t2 >= readProtectionLimits().holdingTemperatureC)
        throw new Error('Перегрев при поддержании 100 °C.');
      const wasWarming = this.holdingWarmup;
      if (t2 <= 90) this.holdingWarmup = true;
      if (t2 >= 95) this.holdingWarmup = false;
      if (wasWarming !== this.holdingWarmup) {
        this.holdingRegulator!.reset();
        this.holdingWarmupRegulator!.reset();
      }
      const regulator = this.holdingWarmup
        ? this.holdingWarmupRegulator!
        : this.holdingRegulator!;
      const channels = regulator.step(t2, 100, 100, 0, dt, this.powerBudgetW);
      this.heatChannels = channels;
      this.heating = heatOutputs.some((name) => channels[name]);
      this.cooling = channels.cooling;
      await applyProfileOutputs(this.heating, this.cooling, channels);
    } catch (error) {
      await this.failHolding(
        error instanceof Error ? error.message : String(error),
      );
    }
  }
  private async failHolding(message: string) {
    this.holding = false;
    this.pendingReady = false;
    this.coolAfterStop = true;
    this.coolingUntil = this.clock() + 30000;
    clearTimeout(this.timer);
    try {
      await applyProfileOutputs(false, true);
      this.needsOutputReset = false;
    } catch (error) {
      this.needsOutputReset = true;
      message += `; нет подтверждения отключения: ${String(error)}`;
    } finally {
      setProfileControl(false);
    }
    this.heating = false;
    this.cooling = false;
    this.status = {
      ...this.status,
      error: `Поддержание остановлено: ${message}`,
    };
    if (this.status.id) addRunEvent(this.status.id, this.status.error!);
    checkpointDatabase();
    try {
      await playBoardErrorSound();
    } catch (soundError) {
      console.warn('Сигнал ошибки поддержания:', String(soundError));
    }
  }
  async stop() {
    setDoorWarning(false);
    this.pendingReady = false;
    if (this.holding) {
      this.holding = false;
      clearTimeout(this.timer);
      await this.operation;
      setProfileControl(false);
      try {
        const board = await readProfileController();
        await this.resetIdleOutputs(
          Math.max(
            board.telemetry?.chamberTemperatureC ?? Infinity,
            board.telemetry?.boardTemperatureC ?? Infinity,
          ),
        );
      } catch (error) {
        await this.failHolding(
          `Не удалось остановить поддержание: ${String(error)}`,
        );
      }
      return this.snapshot();
    }
    if (!this.active()) {
      const board = await readProfileController();
      await this.resetIdleOutputs(
        Math.max(
          board.telemetry?.chamberTemperatureC ?? Infinity,
          board.telemetry?.boardTemperatureC ?? Infinity,
        ),
      );
      return this.snapshot();
    }
    this.stopped = true;
    clearTimeout(this.timer);
    await this.operation;
    if (this.active()) await this.finish('stopped', null);
    if (this.holding) this.schedule();
    return this.snapshot();
  }
}
export const profileRunner = new ProfileRunner();
