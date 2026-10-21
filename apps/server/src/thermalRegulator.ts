import {
  heatOutputs,
  type HeatOutput,
  type ThermalSettings,
  type ResponseBand,
} from '@mercury/shared';
import {
  planHeatPulse,
  predictionHorizonSeconds,
  type HeatPulse,
} from './predictiveHeat.js';

export type ThermalOutputs = Record<HeatOutput, boolean> & { cooling: boolean };
export class ThermalRegulator {
  private integral = 0;
  private previous: number | undefined;
  private rate = 0;
  private passiveLossRate = 0;
  private lastHeating = false;
  private lastCooling = false;
  private previousSlope: number | undefined;
  private recoveringShelf: number | undefined;
  private remember(result: ThermalOutputs) {
    this.lastHeating = heatOutputs.some((name) => result[name]);
    this.lastCooling = result.cooling;
    return result;
  }
  private debts = Object.fromEntries(
    heatOutputs.map((name) => [name, 0]),
  ) as Record<HeatOutput, number>;
  private coolDebt = 0;
  private lastLamp: HeatOutput | undefined;
  private lampPulseSeconds = 0;
  private rotateLampPulse(
    result: ThermalOutputs,
    lamps: HeatOutput[],
    budgetW: number,
    dt: number,
  ) {
    if (!Number.isFinite(budgetW)) return result;
    const requested = lamps.find((name) => result[name]);
    if (!requested) return result;
    const previousIndex =
      this.lastLamp === undefined ? -1 : lamps.indexOf(this.lastLamp);
    const chosen = lamps[(previousIndex + 1) % lamps.length]!;
    if (chosen === this.lastLamp && this.lampPulseSeconds + dt > 5) {
      result[requested] = false;
      this.lampPulseSeconds = 0;
      return result;
    }
    if (chosen !== requested) {
      result[requested] = false;
      result[chosen] = true;
      this.debts[requested] += 1;
      this.debts[chosen] -= 1;
    }
    this.lampPulseSeconds =
      chosen === this.lastLamp ? this.lampPulseSeconds + dt : dt;
    this.lastLamp = chosen;
    return result;
  }
  constructor(
    private settings: ThermalSettings,
    private heatRate: number,
    private coolRate: number,
    private availableOutputs: readonly HeatOutput[] = heatOutputs,
    private measuredResponse?: readonly ResponseBand[],
  ) {}
  reset() {
    this.integral = 0;
    this.previous = undefined;
    this.rate = 0;
    this.passiveLossRate = 0;
    this.lastHeating = false;
    this.lastCooling = false;
    this.previousSlope = undefined;
    this.recoveringShelf = undefined;
    this.coolDebt = 0;
    this.lampPulseSeconds = 0;
    for (const name of heatOutputs) this.debts[name] = 0;
  }

  step(
    measured: number,
    target: number,
    futureTarget: number,
    slope: number,
    dt: number,
    budgetW: number,
    finalCooling = false,
  ): ThermalOutputs {
    const result: ThermalOutputs = {
      topHeater: false,
      bottomHeater: false,
      infrared: false,
      infrared2: false,
      infrared3: false,
      cooling: false,
    };
    const observedRate =
      this.previous === undefined ? undefined : (measured - this.previous) / dt;
    this.rate =
      this.previous === undefined
        ? 0
        : 0.8 * this.rate + (0.2 * (measured - this.previous)) / dt;
    this.previous = measured;
    // Bias only a flat reference by half a degree. Keep the saved
    // trajectory and cooling thresholds unchanged; never bias a falling ramp.
    const shelfBias = !finalCooling && slope === 0 ? 0.5 : 0;
    // A future falling segment must not lower the current shelf's reference.
    // Switch to its falling target when the profile clock actually reaches it.
    const heatTarget = shelfBias > 0 ? target + shelfBias : futureTarget;
    const error = target - measured;
    const heatError = error + shelfBias;
    if (shelfBias > 0 && this.previousSlope !== 0 && error > 1)
      this.recoveringShelf = target;
    if (shelfBias === 0 || this.recoveringShelf !== target)
      this.recoveringShelf = undefined;
    this.previousSlope = slope;
    const band = this.measuredResponse?.find(
      (item) => measured >= item.fromC && measured <= item.toC,
    );
    // Provisional low-temperature response measured during the 45 °C trial.
    const effectiveCoolingRate =
      band?.coolingCPerSecond ??
      Math.min(this.coolRate, Math.max(0.05, (measured - 25) * 0.005));
    // Observe passive cooling only after a tick with all thermal outputs off.
    // Do not confuse fan-assisted cooling with the heat needed to hold a shelf.
    if (observedRate !== undefined && !this.lastHeating && !this.lastCooling)
      this.passiveLossRate =
        0.85 * this.passiveLossRate +
        0.15 * Math.min(this.heatRate, Math.max(0, -observedRate));
    // The ramp slope becomes zero at a shelf, but the oven can still be
    // several degrees below it. Allow controlled closing motion rather than
    // treating every remaining degree/second as overshoot at that boundary.
    const closingRate =
      this.recoveringShelf !== undefined ? Math.max(0, heatError) / 3 : 0;
    const derivativeMotion =
      this.recoveringShelf !== undefined
        ? Math.max(0, this.rate - closingRate)
        : this.rate - Math.max(0, slope);
    const demand =
      (this.recoveringShelf !== undefined ? closingRate : slope) +
      (slope >= 0 ? this.passiveLossRate : 0) +
      this.settings.kp * heatError +
      this.settings.ki * this.integral -
      this.settings.kd * derivativeMotion;
    const fullRate = Math.max(
      0.01,
      this.settings.mode === 'combined' && band
        ? band.heatingCPerSecond
        : this.heatRate,
    );
    const integralLimit =
      this.settings.ki > 0 ? fullRate / this.settings.ki : 0;
    if (
      (demand > -effectiveCoolingRate && demand < fullRate) ||
      (demand >= fullRate && error < 0) ||
      (demand <= -effectiveCoolingRate && error > 0)
    )
      this.integral = Math.max(
        -integralLimit,
        Math.min(integralLimit, this.integral + error * dt),
      );
    // Follow falling ramps before a large temperature error accumulates.
    const forecast = measured + this.rate * predictionHorizonSeconds;
    const wantCooling =
      finalCooling ||
      error < -this.settings.coolingDeadbandC ||
      (slope < 0 && forecast > futureTarget + this.settings.coolingDeadbandC);
    if (wantCooling) {
      const duty = finalCooling
        ? 1
        : Math.min(
            1,
            Math.max(
              0,
              -slope / Math.max(0.01, effectiveCoolingRate),
              -demand / Math.max(0.01, effectiveCoolingRate),
              ((measured - target) * this.settings.kp) /
                Math.max(0.01, effectiveCoolingRate),
            ),
          );
      this.coolDebt += duty;
      result.cooling = this.coolDebt >= 1;
      if (result.cooling) this.coolDebt -= 1;
      this.coolDebt = Math.min(1, this.coolDebt);
      for (const name of heatOutputs) this.debts[name] = 0;
      return this.remember(result);
    }
    this.coolDebt = 0;
    const nearShelf = shelfBias > 0 && error <= 1.5;
    // Close to the shelf, reserve room for residual heat: do not subtract
    // estimated passive losses from the positive coast forecast.
    const coastForecast =
      measured +
      Math.max(0, this.rate) *
        (nearShelf ? 3 : shelfBias > 0 ? 2 : predictionHorizonSeconds) -
      (shelfBias > 0 && !nearShelf ? this.passiveLossRate * 3 : 0);
    const coastTarget = nearShelf ? target + 0.25 : heatTarget;
    if (
      (heatError <= 0 && heatTarget <= measured) ||
      demand <= 0 ||
      coastForecast > coastTarget
    ) {
      // A short coast below the shelf must not repeatedly discard the
      // fractional pulse already requested. Clear it once the goal is reached.
      if (heatError <= 0 || slope < 0)
        for (const name of heatOutputs) this.debts[name] = 0;
      return this.remember(result);
    }
    const enabled = this.availableOutputs.filter(
      (name) =>
        this.settings.powersW[name] > 0 &&
        (this.settings.mode === 'combined' ||
          (this.settings.mode === 'lamps'
            ? name.startsWith('infrared')
            : !name.startsWith('infrared'))),
    );
    const duty = Math.min(1, demand / fullRate);
    if (this.settings.mode === 'combined') {
      const heaters = enabled.filter((name) => !name.startsWith('infrared'));
      const lamps = enabled.filter((name) => name.startsWith('infrared'));
      const heaterPower = heaters.reduce(
        (sum, name) => sum + this.settings.powersW[name],
        0,
      );
      const lampPower = Number.isFinite(budgetW)
        ? Math.max(0, ...lamps.map((name) => this.settings.powersW[name]))
        : lamps.reduce((sum, name) => sum + this.settings.powersW[name], 0);
      const pulse = planHeatPulse(
        measured,
        heatTarget,
        this.rate,
        fullRate,
        heaterPower,
        lampPower,
      );
      const strongHeat = error >= 10 && duty >= 1;
      let source: HeatPulse['source'] | 'oneLamp' = strongHeat
        ? 'combined'
        : pulse.source;
      let pulseDuty = strongHeat ? 1 : pulse.duty;
      if (shelfBias > 0) {
        // On a flat shelf PI/D controls average power directly. The positional
        // predictor used on ramps cannot compensate a sustained heat loss.
        const requestedPower =
          Math.min(1, demand / (fullRate + this.passiveLossRate)) *
          (heaterPower + lampPower);
        // Bound a whole on-tick too, not merely its average duty. Near the
        // shelf a large lamp group can be excessive even at a low mean duty.
        const pulsePowerLimit = Math.max(
          0,
          (((target + 0.5 - measured) / dt +
            this.passiveLossRate -
            Math.max(0, this.rate)) *
            (heaterPower + lampPower)) /
            (fullRate + this.passiveLossRate),
        );
        const sources = [
          { source: 'oneHeater' as const, power: heaterPower / heaters.length },
          { source: 'heaters' as const, power: heaterPower },
          {
            source: 'oneLamp' as const,
            power: Math.min(
              ...lamps.map((name) => this.settings.powersW[name]),
            ),
          },
          { source: 'lamps' as const, power: lampPower },
          { source: 'combined' as const, power: heaterPower + lampPower },
        ]
          .filter((item) => item.power > 0 && item.power <= pulsePowerLimit)
          .sort((a, b) => a.power - b.power);
        const selected =
          sources.find((item) => item.power >= requestedPower) ??
          sources.at(-1);
        source = selected?.source ?? 'off';
        pulseDuty = selected ? Math.min(1, requestedPower / selected.power) : 0;
      }
      if (source === 'off') {
        return this.remember(result);
      }
      if (source === 'oneLamp') {
        for (const name of lamps) this.debts[name] += pulseDuty / lamps.length;
        const name = [...lamps].sort(
          (a, b) => this.debts[b] - this.debts[a],
        )[0];
        if (name && this.debts[name] >= 1) {
          result[name] = true;
          this.debts[name] -= 1;
        }
        return this.remember(this.rotateLampPulse(result, lamps, budgetW, dt));
      }
      if (source === 'oneHeater') {
        for (const name of heaters)
          this.debts[name] += pulseDuty / heaters.length;
        const name = [...heaters].sort(
          (a, b) => this.debts[b] - this.debts[a],
        )[0];
        if (name && this.debts[name] >= 1) {
          result[name] = true;
          this.debts[name] -= 1;
        }
        return this.remember(result);
      }
      const heaterDuty = source === 'lamps' ? 0 : pulseDuty;
      for (const name of heaters)
        this.debts[name] = heaterDuty
          ? this.debts[name] + heaterDuty
          : this.debts[name];
      if (
        heaterDuty > 0 &&
        heaters.length &&
        heaters.every((name) => this.debts[name] >= 1)
      ) {
        for (const name of heaters) {
          result[name] = true;
          this.debts[name] -= 1;
        }
      }
      for (const name of lamps)
        this.debts[name] =
          source === 'heaters'
            ? this.debts[name]
            : Math.min(lamps.length + 1, this.debts[name] + pulseDuty);
      for (const name of (source === 'heaters' ? [] : [...lamps]).sort(
        (a, b) => this.debts[b] - this.debts[a],
      )) {
        if (this.debts[name] >= 1) {
          result[name] = true;
          this.debts[name] -= 1;
          if (Number.isFinite(budgetW)) break;
        }
      }
      return this.remember(this.rotateLampPulse(result, lamps, budgetW, dt));
    }
    for (const name of enabled)
      this.debts[name] = Math.min(enabled.length + 1, this.debts[name] + duty);
    let available = budgetW - this.settings.auxiliaryPowerW;
    // On single-phase supply, alternate one load at a time. Lamp pairs use
    // the engineer-approved sequential mode, not an instantaneous 10 A limit.
    for (const name of [...enabled].sort(
      (a, b) => this.debts[b] - this.debts[a],
    )) {
      if (
        this.debts[name] >= 1 &&
        (this.settings.powersW[name] <= available ||
          (Number.isFinite(budgetW) && name.startsWith('infrared')))
      ) {
        result[name] = true;
        available -= this.settings.powersW[name];
        this.debts[name] -= 1;
        if (Number.isFinite(budgetW)) break;
      }
    }
    return this.remember(
      this.rotateLampPulse(
        result,
        enabled.filter((name) => name.startsWith('infrared')),
        budgetW,
        dt,
      ),
    );
  }
}
