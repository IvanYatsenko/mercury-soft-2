import { createRequire } from 'node:module';
import { config } from '../config.js';
import {
  getOvenModel,
  readOvenSelection,
  readThermalSettings,
  readSoundOnErrors,
} from '../ovenSettings.js';
import { heatOutputs } from '@mercury/shared';
import { virtualBoard } from './virtualBoard.js';
import { LampOutputProtection } from './lampOutputProtection.js';

const lampProtection = new LampOutputProtection();

const require = createRequire(import.meta.url);

type ItmpClient = {
  call: (
    name: string,
    args: unknown[],
    options?: unknown,
    timeout?: number,
  ) => Promise<unknown>;
  describe: (topic: string, timeout?: number) => Promise<unknown>;
  close: () => void;
};

type ItmpModule = {
  connect: (url: string) => ItmpClient | undefined;
};

const itmp = require('itmp') as ItmpModule;

export type ControllerConnectionCheck = {
  doorOpen?: boolean;
  connected: boolean;
  port: string;
  protocolVersion?: 0 | 1 | 2;
  boardType?: '220V' | '230V' | '380V' | 'unknown';
  ready?: boolean;
  state?: number;
  readData?: unknown;
  telemetry?: OvenTelemetry;
  simulated?: boolean;
  error?: string;
};

type OvenTelemetry = {
  chamberTemperatureC: number | null;
  boardTemperatureC: number | null;
  convectionFanHz: number | null;
  lamps: boolean | null;
  heaters: boolean | null;
  fans: boolean | null;
  convection: boolean | null;
};

function decodeTelemetry(
  readData: unknown,
  hv: unknown,
  protocolVersion: number,
  boardType: ControllerConnectionCheck['boardType'],
): OvenTelemetry {
  const selection = readOvenSelection();
  const model = selection && getOvenModel(selection.ovenModel);
  const outputs =
    boardType === '380V'
      ? model?.outputs.threePhase
      : model?.outputs.singlePhase;
  const data = Array.isArray(readData) ? readData : [];
  const heaters = Array.isArray(hv) ? hv : [];
  const temperature = (index: number): number | null => {
    const value = data[index];
    if (!Number.isFinite(value)) return null;
    return protocolVersion >= 2
      ? value / 4
      : Math.round(
          24.5809 * (((data[0] / 32) * 0.039986) ** 1.01 + value / 128),
        );
  };
  const active = (names: string[]): boolean | null => {
    if (!outputs || !Array.isArray(hv)) return null;
    return names.some((name) => {
      const index = outputs[name];
      return index !== undefined && Number(heaters[index]) !== 0;
    });
  };
  return {
    chamberTemperatureC: temperature(
      model?.sensors.chamberTemperature.index ?? 2,
    ),
    boardTemperatureC: temperature(model?.sensors.boardTemperature.index ?? 1),
    convectionFanHz: Number.isFinite(data[3]) ? data[3] : null,
    lamps: active(['infrared', 'infrared2', 'infrared3']),
    heaters: active(['topHeater', 'bottomHeater']),
    fans: active(['f1', 'f2']),
    convection: active(['convection']),
  };
}

type ControllerSession = {
  port: string;
  client: ItmpClient;
  protocolVersion?: 0 | 1 | 2;
  boardType?: ControllerConnectionCheck['boardType'];
  ready?: boolean;
};

const WORKING = 1;
const STARTING = 256;
const NO_COMMAND_TIMEOUT = 2;
const ELEMENT_TEST_DURATION_MS = 3000;
const testElementLabels = {
  topHeater: 'Верхний нагреватель',
  bottomHeater: 'Нижний нагреватель',
  convection: 'Конвекционный вентилятор',
  infrared: 'Инфракрасная лампа 1',
  infrared2: 'Инфракрасная лампа 2',
  infrared3: 'Инфракрасная лампа 3',
  f1: 'Вентилятор охлаждения 1',
  f2: 'Вентилятор охлаждения 2',
} as const;

export function listTestElements() {
  const selection = readOvenSelection();
  const model = selection && getOvenModel(selection.ovenModel);
  if (!model) return [];
  const parallelFans = hasParallelCoolingFans(model.model, session?.boardType);
  return Object.entries(testElementLabels)
    .filter(
      ([name]) =>
        name in model.outputs.singlePhase && !(parallelFans && name === 'f2'),
    )
    .map(([name, label]) => ({
      name,
      label: parallelFans && name === 'f1' ? 'Вентиляторы охлаждения' : label,
    }));
}

function hasParallelCoolingFans(
  model: string,
  boardType: ControllerConnectionCheck['boardType'],
) {
  return (
    model === '300' &&
    (isSimulationMode() || boardType === '230V' || boardType === '380V')
  );
}

export async function playBoardStartupSound() {
  return playBoardSignal([[40, 0]]);
}
export async function playBoardCompletionSound(matchesProfile: boolean) {
  return playBoardSignal(
    Array.from({ length: matchesProfile ? 2 : 3 }, () => [700, 250]),
  );
}
export async function playBoardErrorSound() {
  return playBoardSignal(
    [
      [150, 150],
      [150, 150],
      [150, 0],
    ],
    readSoundOnErrors,
    true,
  );
}
let doorWarning = false;
let doorWarningGeneration = 0;
let doorWarningTimer: ReturnType<typeof setTimeout> | undefined;
export function setDoorWarning(open: boolean) {
  if (open === doorWarning) return;
  doorWarning = open;
  const generation = ++doorWarningGeneration;
  clearTimeout(doorWarningTimer);
  if (!open) return;
  const pulse = async () => {
    try {
      await playBoardSignal(
        [[150, 0]],
        () =>
          doorWarning &&
          generation === doorWarningGeneration &&
          readSoundOnErrors(),
        true,
      );
    } catch (error) {
      console.warn('Сигнал открытой двери:', getErrorMessage(error));
    }
    if (doorWarning && generation === doorWarningGeneration)
      doorWarningTimer = setTimeout(() => void pulse(), 650);
    doorWarningTimer?.unref();
  };
  void pulse();
}
async function playBoardSignal(
  rhythm: number[][],
  shouldPlay = () => true,
  quietIfUnavailable = false,
) {
  return runExclusive(async () => {
    if (!shouldPlay()) return;
    const simulated = isSimulationMode();
    const activeSession = simulated
      ? undefined
      : getOrCreateSession(config.serialPort);
    const call = async (name: string, args: number[] = []) =>
      simulated
        ? virtualBoard.call(name, args)
        : activeSession!.client.call(name, args, undefined, 1200);
    const healthy = async () => {
      const state = readState(await call('stat'));
      return (
        (state & WORKING) !== 0 &&
        (state & (STARTING | 2 | 4 | 8 | 32 | 64 | 128)) === 0
      );
    };
    if (!(await healthy())) {
      if (quietIfUnavailable) return;
      throw new Error('Плата не готова к стартовому сигналу.');
    }
    const original = await call('setLV');
    if (!Array.isArray(original) || original.length !== 6)
      throw new Error('Неверный ответ setLV.');
    if (Number(original[3]) !== 0) return;
    const setBuzzer = async (enabled: boolean) => {
      const values = await call('setLV');
      if (!Array.isArray(values) || values.length !== 6)
        throw new Error('Неверный ответ setLV.');
      const next = values.map(Number);
      next[3] = Number(enabled);
      await call('setLV', next);
    };
    try {
      for (const [duration, pause] of rhythm) {
        if (!shouldPlay() || !(await healthy())) break;
        await setBuzzer(true);
        await new Promise((resolve) => setTimeout(resolve, duration));
        if (!(await healthy())) break;
        await setBuzzer(false);
        await new Promise((resolve) => setTimeout(resolve, pause));
      }
    } finally {
      // Do not silence the firmware buzzer if an alarm occurred during the chime.
      if (await healthy()) await setBuzzer(false);
    }
  });
}

let session: ControllerSession | undefined;
let activeCheck: Promise<ControllerConnectionCheck> | undefined;
let activeOperation: Promise<unknown> | undefined;
let convectionEnabled = true;
let profileControl = false;
export function setProfileControl(active: boolean) {
  profileControl = active;
  if (active) convectionEnabled = true;
}
export function advanceIdleSimulation(seconds: number) {
  if (!isSimulationMode()) return;
  const selection = readOvenSelection();
  const model = selection && getOvenModel(selection.ovenModel);
  const snapshot = virtualBoard.snapshot();
  const cooling = model
    ? Boolean(
        snapshot.highVoltageOutputs[model.outputs.singlePhase.f1!] ||
        snapshot.highVoltageOutputs[model.outputs.singlePhase.f2!],
      )
    : false;
  virtualBoard.advance(seconds, false, cooling);
}

export async function readProfileController() {
  return runExclusive(async () => {
    const simulated = isSimulationMode();
    const activeSession = simulated
      ? undefined
      : getOrCreateSession(config.serialPort);
    const status = simulated
      ? simulatedCheck()
      : activeSession
        ? await readController(activeSession)
        : ({
            connected: false,
            port: config.serialPort,
          } as ControllerConnectionCheck);
    if ((status.state ?? 0) & (2 | 4 | 8 | 32 | 64 | 128))
      throw new Error(`Ошибка платы: ${status.state}`);
    if (!status.connected || !status.ready)
      throw new Error(status.error ?? 'Плата не готова.');
    const sensors = simulated
      ? virtualBoard.call('sensors')
      : await activeSession!.client.call('sensors', [], undefined, 1200);
    if (!Array.isArray(sensors) || sensors.length < 2)
      throw new Error('Не удалось прочитать датчик двери.');
    const doorIndex = (status.protocolVersion ?? 2) >= 2 ? 1 : 6;
    if (![0, 1].includes(Number(sensors[doorIndex])))
      throw new Error('Неверное значение датчика двери.');
    return { ...status, doorOpen: Boolean(sensors[doorIndex]) };
  });
}

export async function applyProfileOutputs(
  heating: boolean,
  cooling: boolean,
  heatChannels?: Record<string, boolean>,
) {
  return runExclusive(async () => {
    const selection = readOvenSelection();
    const model = selection && getOvenModel(selection.ovenModel);
    if (!model) throw new Error('Не выбрана печь.');
    const simulated = isSimulationMode();
    const activeSession = simulated
      ? undefined
      : getOrCreateSession(config.serialPort);
    if (!simulated && !activeSession) throw new Error('Нет связи с платой.');
    const outputs =
      activeSession?.boardType === '380V'
        ? model.outputs.threePhase
        : model.outputs.singlePhase;
    if (
      (heating || Object.values(heatChannels ?? {}).some(Boolean)) &&
      activeSession?.boardType === 'unknown'
    )
      throw new Error('Не определена плата.');
    const values = Array<number>(8).fill(0);
    values[outputs.convection!] = 1;
    for (const name of heatOutputs)
      if (outputs[name] !== undefined)
        values[outputs[name]!] = Number(
          heatChannels
            ? Boolean(heatChannels[name])
            : !name.startsWith('infrared') && heating,
        );
    const activeHeat = heatOutputs.filter(
      (name) => outputs[name] !== undefined && values[outputs[name]!] !== 0,
    );
    if (cooling && activeHeat.length)
      throw new Error('Нагрев и охлаждение не могут работать одновременно.');
    if (activeHeat.length) {
      const settings = readThermalSettings();
      if (activeHeat.some((name) => settings.powersW[name] <= 0))
        throw new Error('Не заданы мощности потребителей.');
      const power =
        settings.auxiliaryPowerW +
        activeHeat.reduce((sum, name) => sum + settings.powersW[name], 0);
      if (selection.connectionVoltage !== '380') {
        const lampPairs = activeHeat.filter((name) =>
          name.startsWith('infrared'),
        );
        if (lampPairs.length > 1)
          throw new Error('Лампы включаются только по одной паре.');
        const combined = settings.mode === 'combined';
        if (lampPairs.length && activeHeat.length > 1 && !combined)
          throw new Error(
            'Совместный нагрев разрешён только в комбинированном режиме.',
          );
        if (!combined && !lampPairs.length && power > 220 * 10)
          throw new Error('Команда нагрева превышает предел 10 А.');
      }
    }
    for (const name of ['f1', 'f2'])
      if (
        outputs[name] !== undefined &&
        !(
          name === 'f2' &&
          hasParallelCoolingFans(model.model, activeSession?.boardType)
        )
      )
        values[outputs[name]!] = Number(cooling);
    const lampIndices: number[] = heatOutputs
      .filter(
        (name) => name.startsWith('infrared') && outputs[name] !== undefined,
      )
      .map((name) => outputs[name]!);
    // Off and cooling commands must not depend on a preceding output read.
    const previous = lampIndices.some((index) => values[index])
      ? simulated
        ? virtualBoard.call('setHV', [])
        : await activeSession!.client.call('setHV', [], undefined, 1200)
      : values.map((value, index) => (lampIndices.includes(index) ? 1 : value));
    if (!Array.isArray(previous) || previous.length !== 8)
      throw new Error('Не удалось прочитать выходы перед переключением ламп.');
    await lampProtection.apply(
      previous.map(Number),
      values,
      lampIndices,
      async (next) => {
        if (simulated) virtualBoard.call('setHV', next);
        else await activeSession!.client.call('setHV', next, undefined, 1200);
      },
      async () => {
        const state = readState(
          simulated
            ? virtualBoard.call('stat', [])
            : await activeSession!.client.call('stat', [], undefined, 1200),
        );
        if (!(state & 1) || state & (2 | 4 | 8 | 32 | 64 | 128))
          throw new Error(`Плата не готова к включению ламп: ${state}`);
      },
    );
  });
}

async function applyConvection(
  hv: unknown,
  boardType: ControllerConnectionCheck['boardType'],
  enabled: boolean,
  call: (values: number[]) => unknown | Promise<unknown>,
) {
  const selection = readOvenSelection();
  const model = selection && getOvenModel(selection.ovenModel);
  const outputs =
    boardType === '380V'
      ? model?.outputs.threePhase
      : model?.outputs.singlePhase;
  const index = outputs?.convection;
  if (index === undefined || !Array.isArray(hv) || hv.length !== 8)
    throw new Error('Не удалось определить выход конвекционного вентилятора.');
  const values = hv.map(Number);
  if (Boolean(values[index]) !== enabled) {
    values[index] = enabled ? 1 : 0;
    await call(values);
  }
  return values;
}

export async function setConvectionEnabled(
  enabled: boolean,
): Promise<ControllerConnectionCheck> {
  if (profileControl)
    throw new Error(
      'Во время выполнения профиля конвекция управляется автоматически.',
    );
  return runExclusive(async () => {
    if (isSimulationMode()) {
      const status = simulatedCheck();
      if (!status.ready) throw new Error('Плата не готова.');
      await applyConvection(
        virtualBoard.call('setHV'),
        'unknown',
        enabled,
        (values) => virtualBoard.call('setHV', values),
      );
      convectionEnabled = enabled;
      return simulatedCheck();
    }
    const activeSession = getOrCreateSession(config.serialPort);
    if (!activeSession) throw new Error('Нет связи с платой.');
    const status = await readController(activeSession);
    if (!status.connected || !status.ready)
      throw new Error(status.error ?? 'Плата не готова.');
    await applyConvection(
      await activeSession.client.call('setHV', [], undefined, 1200),
      status.boardType,
      enabled,
      (values) => activeSession.client.call('setHV', values, undefined, 1200),
    );
    convectionEnabled = enabled;
    return readController(activeSession);
  });
}

/** Initializes and checks the controller over the persistent serial connection. */
export async function initializeControllerConnection(
  port = config.serialPort,
): Promise<ControllerConnectionCheck> {
  if (isSimulationMode()) {
    return runExclusive(async () => {
      if (!profileControl) virtualBoard.call('stat', [2]);
      if (readOvenSelection())
        await applyConvection(
          virtualBoard.call('setHV'),
          'unknown',
          convectionEnabled,
          (values) => virtualBoard.call('setHV', values),
        );
      return simulatedCheck();
    });
  }

  return runExclusive(async () => {
    let activeSession: ControllerSession | undefined;
    try {
      activeSession = getOrCreateSession(port);
    } catch (error) {
      return { connected: false, port, error: getErrorMessage(error) };
    }

    if (!activeSession) {
      return {
        connected: false,
        port,
        error: 'Не удалось создать ITMP-подключение.',
      };
    }

    return readController(activeSession, true);
  });
}

export async function checkControllerConnection(
  port = config.serialPort,
): Promise<ControllerConnectionCheck> {
  if (isSimulationMode()) return simulatedCheck();

  return runConnectionCheck(() => performConnectionCheck(port));
}

async function runConnectionCheck(
  check: () => Promise<ControllerConnectionCheck>,
): Promise<ControllerConnectionCheck> {
  if (activeCheck) return activeCheck;

  activeCheck = runExclusive(check);
  try {
    return await activeCheck;
  } finally {
    activeCheck = undefined;
  }
}

async function runExclusive<T>(operation: () => Promise<T>): Promise<T> {
  const previous = activeOperation?.catch(() => undefined) ?? Promise.resolve();
  const current = previous.then(operation);
  activeOperation = current;

  try {
    return await current;
  } finally {
    if (activeOperation === current) activeOperation = undefined;
  }
}

/** Pulses one configured output, preserving the running convection fan. */
export async function testOvenElement(name: unknown): Promise<{
  success: boolean;
  simulated: boolean;
  error?: string;
}> {
  if (profileControl)
    return {
      success: false,
      simulated: isSimulationMode(),
      error: 'Останови профиль перед проверкой элементов.',
    };
  if (typeof name !== 'string' || !Object.hasOwn(testElementLabels, name)) {
    return {
      success: false,
      simulated: isSimulationMode(),
      error: 'Этот элемент недоступен для выбранной печи.',
    };
  }

  return runExclusive(async () => {
    const simulated = isSimulationMode();
    let activeSession: ControllerSession | undefined;
    try {
      const selection = readOvenSelection();
      const model = selection && getOvenModel(selection.ovenModel);
      if (!model || !(name in model.outputs.singlePhase))
        throw new Error('Этот элемент недоступен для выбранной печи.');
      if (!simulated) activeSession = getOrCreateSession(config.serialPort);
      if (!simulated && !activeSession) throw new Error('Нет связи с платой.');

      const status = simulated
        ? simulatedCheck()
        : await readController(activeSession!);
      if (!status.connected || !status.ready)
        throw new Error(
          status.error ??
            `Плата не готова к проверке (состояние ${status.state ?? 'не прочитано'}).`,
        );
      if (
        name === 'f2' &&
        hasParallelCoolingFans(model.model, status.boardType)
      )
        throw new Error(
          'На этой плате вентиляторы охлаждения проверяются вместе.',
        );
      if (!simulated && status.boardType === 'unknown') {
        throw new Error('Не удалось определить тип платы.');
      }

      const outputs =
        status.boardType === '380V'
          ? model.outputs.threePhase
          : model.outputs.singlePhase;
      const index = outputs[name];
      if (index === undefined || index === 0)
        throw new Error('Выход элемента не найден.');
      const call = (values: number[]) =>
        simulated
          ? virtualBoard.call('setHV', values)
          : activeSession!.client.call('setHV', values, undefined, 1200);
      const current = await call([]);
      const convectionIndex = outputs.convection;
      if (
        !Array.isArray(current) ||
        current.length !== 8 ||
        current.some(
          (value, outputIndex) =>
            outputIndex > 0 &&
            outputIndex !== convectionIndex &&
            Number(value) !== 0,
        )
      ) {
        throw new Error('Проверка недоступна: один из выходов уже включён.');
      }

      if (name === 'convection' && Number(current[index]) !== 0)
        throw new Error('Конвекционный вентилятор уже включён.');

      const values = current.map(Number);
      values[index] = 1;
      try {
        await call(values);
        // Firmware disables outputs after three seconds without a command.
        // Keep the exclusive UART operation, but feed the watchdog during the pulse.
        const startedAt = Date.now();
        while (Date.now() - startedAt < ELEMENT_TEST_DURATION_MS) {
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              Math.min(
                500,
                ELEMENT_TEST_DURATION_MS - (Date.now() - startedAt),
              ),
            ),
          );
          const state = readState(
            simulated
              ? virtualBoard.call('stat')
              : await activeSession!.client.call('stat', [], undefined, 1200),
          );
          if (
            (state & WORKING) === 0 ||
            (state & (STARTING | 2 | 4 | 8 | 32 | 64 | 128)) !== 0
          )
            throw new Error(`Проверка остановлена: состояние платы ${state}.`);
        }
      } finally {
        await call(current.map(Number));
      }
      return { success: true, simulated };
    } catch (error) {
      return { success: false, simulated, error: getErrorMessage(error) };
    }
  });
}

/** Sends the controller-board poweroff command without shutting down the Raspberry Pi. */
export async function powerOffController(
  port = config.serialPort,
  delaySeconds = 5,
): Promise<{
  success: boolean;
  port: string;
  simulated?: boolean;
  error?: string;
}> {
  if (isSimulationMode()) {
    virtualBoard.call('poweroff', [delaySeconds]);
    return { success: true, port: 'SIMULATOR', simulated: true };
  }

  return runExclusive(async () => {
    let activeSession: ControllerSession | undefined;
    try {
      activeSession = getOrCreateSession(port);
    } catch (error) {
      return { success: false, port, error: getErrorMessage(error) };
    }

    if (!activeSession) {
      return {
        success: false,
        port,
        error: `Не удалось открыть ITMP-подключение к ${port}.`,
      };
    }

    try {
      await activeSession.client.call(
        'poweroff',
        [delaySeconds],
        undefined,
        1200,
      );
      activeSession.ready = false;
      return { success: true, port };
    } catch (error) {
      return { success: false, port, error: getErrorMessage(error) };
    }
  });
}

async function performConnectionCheck(
  port: string,
): Promise<ControllerConnectionCheck> {
  let activeSession: ControllerSession | undefined;
  try {
    activeSession = getOrCreateSession(port);
  } catch (error) {
    return { connected: false, port, error: getErrorMessage(error) };
  }

  if (!activeSession) {
    return {
      connected: false,
      port,
      error:
        'Не удалось создать ITMP-подключение. Проверь настройки последовательного порта.',
    };
  }

  return readController(activeSession);
}

function getOrCreateSession(port: string): ControllerSession | undefined {
  if (session && session.port !== port) {
    throw new Error(
      `Сервер уже использует ${session.port}. Перезапусти сервер для смены порта.`,
    );
  }

  if (!session) {
    const url = `itmp.serial://${port}?baudRate=115200&dataBits=8&stopBits=1&parity=none~2`;
    const client = itmp.connect(url);
    if (!client) return undefined;
    session = { port, client };
  }

  return session;
}

function isSimulationMode(): boolean {
  return config.controllerMode === 'simulation';
}

function simulatedCheck(): ControllerConnectionCheck {
  const snapshot = virtualBoard.snapshot();
  try {
    const readData = virtualBoard.call('get');
    return {
      connected: true,
      port: 'SIMULATOR',
      protocolVersion: 2,
      boardType: 'unknown',
      ready: (snapshot.globalState & (WORKING | STARTING | 32)) === WORKING,
      state: snapshot.globalState,
      readData,
      telemetry: decodeTelemetry(
        readData,
        (snapshot.globalState & WORKING) !== 0
          ? virtualBoard.call('setHV')
          : [],
        2,
        'unknown',
      ),
      simulated: true,
      doorOpen: readDoorState(virtualBoard.call('sensors'), 2),
    };
  } catch (error) {
    return {
      connected: false,
      ready: false,
      port: 'SIMULATOR',
      state: snapshot.globalState,
      simulated: true,
      error: getErrorMessage(error),
    };
  }
}

export function getVirtualBoardSnapshot() {
  return virtualBoard.snapshot();
}

async function readController(
  activeSession: ControllerSession,
  initialize = false,
): Promise<ControllerConnectionCheck> {
  const { port, client } = activeSession;

  let readData: unknown;
  try {
    readData = await client.call('get', [], undefined, 1200);
  } catch (error) {
    activeSession.ready = false;
    // The serial link reconnects itself after a port close. Closing the ITMP
    // client here disables that retry and its cached port cannot be reopened.
    return {
      connected: false,
      port,
      error: getErrorMessage(error),
    };
  }

  try {
    let state = readState(await client.call('stat', [], undefined, 1200));
    if (
      initialize &&
      !profileControl &&
      (state & 32) === 0 &&
      ((state & STARTING) !== 0 || (state & NO_COMMAND_TIMEOUT) !== 0)
    ) {
      state = readState(
        await client.call('stat', [NO_COMMAND_TIMEOUT], undefined, 1200),
      );
    }
    activeSession.ready =
      (state & WORKING) !== 0 &&
      (state & (STARTING | NO_COMMAND_TIMEOUT | 4 | 8 | 32 | 64 | 128)) === 0;

    if (activeSession.protocolVersion === undefined) {
      let description: unknown = '';
      try {
        description = await client.describe('@', 1200);
      } catch {
        // Older controller firmware may not implement describe('@').
      }

      if (description !== '') {
        activeSession.protocolVersion = 2;
      } else {
        try {
          await client.call('gett', [], undefined, 1200);
          activeSession.protocolVersion = 1;
        } catch {
          activeSession.protocolVersion = 0;
        }
      }

      const boardDescription = String(description);
      activeSession.boardType =
        description === ''
          ? '220V'
          : boardDescription.includes('120')
            ? '230V'
            : '380V';
    }

    const protocolVersion = activeSession.protocolVersion ?? 0;
    const boardType = activeSession.boardType ?? 'unknown';

    let hv: unknown;
    try {
      if (activeSession.ready)
        hv = await client.call('setHV', [], undefined, 1200);
    } catch (error) {
      if (initialize && activeSession.ready) {
        let failureState: number | undefined;
        try {
          failureState = readState(
            await client.call('stat', [], undefined, 1200),
          );
        } catch {
          // Preserve the original refusal even if the diagnostic read fails.
        }
        throw new Error(
          `Не удалось прочитать выходы платы (setHV): ${getErrorMessage(error)}; состояние после отказа: ${failureState ?? 'не прочитано'}.`,
        );
      }
      // Temperature and connection state remain available if an output read fails.
    }
    if (initialize && activeSession.ready && readOvenSelection()) {
      hv = await applyConvection(hv, boardType, convectionEnabled, (values) =>
        client.call('setHV', values, undefined, 1200),
      );
    }

    return {
      connected: true,
      port,
      protocolVersion,
      boardType,
      ready: activeSession.ready ?? false,
      state,
      readData,
      telemetry: decodeTelemetry(readData, hv, protocolVersion, boardType),
      ...(activeSession.ready
        ? {
            doorOpen: readDoorState(
              await client.call('sensors', [], undefined, 1200),
              protocolVersion,
            ),
          }
        : {}),
    };
  } catch (error) {
    activeSession.ready = false;
    return {
      connected: false,
      port,
      readData,
      error: `Не удалось прочитать состояние платы: ${getErrorMessage(error)}`,
    };
  }
}

function readState(value: unknown): number {
  if (!Array.isArray(value) || !Number.isInteger(value[0])) {
    throw new Error('Команда stat вернула неверный ответ.');
  }
  return value[0] as number;
}
function readDoorState(value: unknown, protocolVersion: number): boolean {
  const index = protocolVersion >= 2 ? 1 : 6;
  if (!Array.isArray(value) || ![0, 1].includes(Number(value[index])))
    throw new Error('Неверное значение датчика двери.');
  return Boolean(Number(value[index]));
}

export function closeControllerConnection(): void {
  setDoorWarning(false);
  session?.client.close();
  session = undefined;
}

process.once('exit', closeControllerConnection);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Контроллер не ответил.';
}
