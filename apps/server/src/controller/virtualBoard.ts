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

class VirtualBoard {
  private powered = true;
  private globalState: number = boardState.STARTING;
  private temperatures = { cpu: 28, t1: 25, t2: 26 };
  private fanFrequency = { fan1: 118, fan2: 121 };
  private highVoltageOutputs = Array<number>(8).fill(0);
  private lowVoltageOutputs = Array<number>(6).fill(0);
  private shutdownDelayMs = 0;
  private shutdownAt: Date | null = null;
  private shutdownTimer: ReturnType<typeof setTimeout> | undefined;

  call(name: string, args: unknown[] = []): unknown {
    this.finishShutdownIfDue();
    if (!this.powered) throw new Error('Виртуальная плата выключена.');

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
        return [
          this.temperatures.cpu,
          this.temperatures.t1 * 4,
          this.temperatures.t2 * 4,
          this.fanFrequency.fan1,
          0,
        ];
      case 'gett':
        return [
          this.temperatures.cpu,
          this.temperatures.t1 * 4,
          this.temperatures.t2 * 4,
          this.fanFrequency.fan1,
          this.globalState,
        ];
      case 'fansfreq':
        return [this.fanFrequency.fan1, this.fanFrequency.fan2];
      case 'sensors':
        return [0, 0];
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
