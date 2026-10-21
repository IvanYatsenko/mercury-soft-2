import { getOvenModel, readOvenSelection } from '../ovenSettings.js';

/**
 * A small ITMP-level emulator based on docs/firmware-source/source/main.cpp.
 * It models protocol responses and observable state; it never controls hardware.
 */
export const boardState = {
  NOT_INITIALIZED: 0,
  WORKING: 1,
  ITMP_NO_CMD_TIMEOUT: 2,
  TSENSOR_ERR: 4,
  OVERHEAT: 8,
  POWERKEY: 16,
  SHUTDOWN: 32,
  EMSTOP_ERR: 64,
  OTHER_ERR: 128,
  STARTING: 256,
  SHUTDOWN_AFTER_RELEASE: 1024,
} as const;

const RESET_MASK =
  boardState.ITMP_NO_CMD_TIMEOUT |
  boardState.TSENSOR_ERR |
  boardState.OVERHEAT |
  boardState.SHUTDOWN |
  boardState.EMSTOP_ERR |
  boardState.OTHER_ERR;
const DEFAULT_SHUTDOWN_DELAY_SECONDS = 0.5;

export type VirtualBoardSnapshot = {
  powered: boolean;
  globalState: number;
  stateFlags: string[];
  temperatures: { cpu: number; t1: number; t2: number };
  fanFrequency: { fan1: number; fan2: number };
  highVoltageOutputs: number[];
  lowVoltageOutputs: number[];
  shutdownDelayMs: number;
  shutdownAt: string | null;
};

export class VirtualBoard {
  private powered = true;
  private globalState: number = boardState.STARTING;
  private temperatures = { cpu: 28, t1: 25, t2: 26 };
  private fanFrequency = { fan1: 118, fan2: 121 };
  private highVoltageOutputs = Array<number>(8).fill(0);
  private lowVoltageOutputs = Array<number>(6).fill(0);
  private shutdownDelayMs = 0;
  private shutdownAt: Date | null = null;
  private shutdownTimer: ReturnType<typeof setTimeout> | undefined;
  private doorOpen = false;
  private disconnected = false;
  private sensorFault = false;
  setTemperatures(board: number, chamber: number) {
    if (!Number.isFinite(board) || !Number.isFinite(chamber))
      throw new Error('Invalid temperature');
    this.temperatures.t1 = board;
    this.temperatures.t2 = chamber;
  }

  advance(
    seconds: number,
    heating: boolean,
    cooling: boolean,
    heatFraction = 1,
  ) {
    const before = this.temperatures.t2;
    this.temperatures.t2 = Math.max(
      25,
      before +
        (heating ? 0.7 * heatFraction : cooling ? -0.4 : -0.08) * seconds,
    );
    this.temperatures.t1 +=
      (this.temperatures.t2 - this.temperatures.t1) * Math.min(1, seconds / 8);
    this.fanFrequency.fan1 = 50;
  }
  setFault(fault: 'door' | 'connection' | 'sensor' | 'overheat' | 'none') {
    this.doorOpen = fault === 'door';
    this.disconnected = fault === 'connection';
    this.sensorFault = fault === 'sensor';
    this.globalState &= ~(boardState.TSENSOR_ERR | boardState.OVERHEAT);
    if (this.sensorFault) this.globalState |= boardState.TSENSOR_ERR;
    if (fault === 'overheat') this.globalState |= boardState.OVERHEAT;
  }

  call(name: string, args: unknown[] = []): unknown {
    this.finishShutdownIfDue();
    if (!this.powered || this.disconnected)
      throw new Error('Нет связи с виртуальной платой.');

    switch (name) {
      case 'stat':
        this.setState(Number(args[0] ?? 0));
        return [this.globalState];
      case 'poweroff':
        this.scheduleShutdown(
          args[0] === undefined
            ? DEFAULT_SHUTDOWN_DELAY_SECONDS
            : Number(args[0]),
        );
        return [this.globalState];
      case 'get':
      case 'gett': {
        const model = getOvenModel(readOvenSelection()?.ovenModel ?? '300');
        const data = [
          this.temperatures.cpu,
          Math.round(this.temperatures.t1 * 4),
          Math.round(this.temperatures.t2 * 4),
          this.fanFrequency.fan1,
          name === 'gett' ? this.globalState : 0,
        ];
        data[model?.sensors.boardTemperature.index ?? 1] = Math.round(
          this.temperatures.t1 * 4,
        );
        data[model?.sensors.chamberTemperature.index ?? 2] = Math.round(
          this.temperatures.t2 * 4,
        );
        return data;
      }
      case 'fansfreq':
        return [this.fanFrequency.fan1, this.fanFrequency.fan2];
      case 'sensors':
        return [0, Number(this.doorOpen)];
      case 'setLV':
        if (args.length)
          this.lowVoltageOutputs = this.normalizeOutputs(args, 6);
        return [...this.lowVoltageOutputs];
      case 'setHV':
        if (
          (this.globalState & boardState.WORKING) === 0 ||
          (this.globalState &
            (boardState.EMSTOP_ERR | boardState.OTHER_ERR)) !==
            0
        ) {
          throw new Error(
            'Плата запрещает включать высоковольтные выходы (-406).',
          );
        }
        if (args.length)
          this.highVoltageOutputs = this.normalizeOutputs(args, 8);
        return [...this.highVoltageOutputs];
      default:
        throw new Error(`Неизвестная команда виртуальной платы: ${name}`);
    }
  }

  snapshot(): VirtualBoardSnapshot {
    this.finishShutdownIfDue();
    const flags = Object.entries(boardState)
      .filter(
        ([name, value]) =>
          name !== 'NOT_INITIALIZED' && (this.globalState & value) !== 0,
      )
      .map(([name]) => name);

    return {
      powered: this.powered,
      globalState: this.globalState,
      stateFlags: flags,
      temperatures: { ...this.temperatures },
      fanFrequency: { ...this.fanFrequency },
      highVoltageOutputs: [...this.highVoltageOutputs],
      lowVoltageOutputs: [...this.lowVoltageOutputs],
      shutdownDelayMs: this.shutdownDelayMs,
      shutdownAt: this.shutdownAt?.toISOString() ?? null,
    };
  }

  reset(): void {
    this.cancelShutdown();
    this.powered = true;
    this.globalState = boardState.STARTING;
    this.highVoltageOutputs.fill(0);
    this.lowVoltageOutputs.fill(0);
    this.shutdownDelayMs = 0;
    this.shutdownAt = null;
    this.temperatures = { cpu: 28, t1: 25, t2: 26 };
    this.setFault('none');
  }

  private setState(value: number): void {
    this.globalState &= ~(value & RESET_MASK);
    if ((this.globalState & boardState.STARTING) !== 0) {
      this.globalState &= ~boardState.STARTING;
      this.globalState |= boardState.WORKING;
      this.lowVoltageOutputs[0] = 1;
      if ((this.globalState & boardState.POWERKEY) !== 0) {
        this.globalState |= boardState.SHUTDOWN_AFTER_RELEASE;
      }
    }
  }

  private scheduleShutdown(seconds: number): void {
    this.cancelShutdown();
    this.shutdownDelayMs = Math.max(0, seconds * 1000);
    this.shutdownAt = new Date(Date.now() + this.shutdownDelayMs);
    this.globalState |= boardState.SHUTDOWN;
    this.lowVoltageOutputs[0] = 0;
    this.shutdownTimer = setTimeout(
      () => this.finishShutdown(),
      this.shutdownDelayMs,
    );
  }

  private finishShutdownIfDue(): void {
    if (this.shutdownAt && Date.now() >= this.shutdownAt.getTime())
      this.finishShutdown();
  }

  private finishShutdown(): void {
    this.cancelShutdown();
    this.powered = false;
    this.globalState = boardState.NOT_INITIALIZED;
    this.highVoltageOutputs.fill(0);
    this.lowVoltageOutputs.fill(0);
    this.shutdownAt = null;
  }

  private cancelShutdown(): void {
    if (this.shutdownTimer) clearTimeout(this.shutdownTimer);
    this.shutdownTimer = undefined;
  }

  private normalizeOutputs(args: unknown[], count: number): number[] {
    const input = Array.isArray(args[0]) ? args[0] : args;
    return Array.from({ length: count }, (_, index) =>
      Number(input[index] ?? 0) !== 0 ? 1 : 0,
    );
  }
}

export const virtualBoard = new VirtualBoard();
