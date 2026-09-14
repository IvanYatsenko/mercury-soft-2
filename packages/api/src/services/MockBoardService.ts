import { FurnaceStatus } from '@mercury-soft-2/shared';

/**
 * Состояние симуляции печи
 */
export interface BoardState {
  temperature: number;
  targetTemperature: number;
  status: FurnaceStatus;
  isRunning: boolean;
  currentStage: number;
  totalStages: number;
  error: string | null;
}

/**
 * Параметры симуляции
 */
export interface BoardConfig {
  /** Начальная температура камеры (°C) */
  ambientTemperature: number;
  /** Скорость нагрева (°C/сек) */
  heatingRate: number;
  /** Скорость охлаждения (°C/сек) */
  coolingRate: number;
  /** Точность поддержания температуры (±°C) */
  temperatureTolerance: number;
  /** Шанс ошибки (0-1, например 0.01 = 1%) */
  errorChance: number;
}

const DEFAULT_CONFIG: BoardConfig = {
  ambientTemperature: 25,
  heatingRate: 2,
  coolingRate: 0.5,
  temperatureTolerance: 2,
  errorChance: 0.001,
};

/**
 * MockBoardService — симуляция реальной платы Меркурий-301/401
 *
 * Используется для тестирования и демонстрации до приезда физического оборудования.
 * Симулирует:
 * - Нагрев/охлаждение камеры
 * - Поддержание температуры
 * - Ошибки оборудования
 * - Статусы нагревателей
 * - Работу вентиляторов
 */
class MockBoardService {
  private config: BoardConfig;
  private state: BoardState;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners: Map<string, Array<(state: BoardState) => void>>;

  constructor(config: Partial<BoardConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      temperature: this.config.ambientTemperature,
      targetTemperature: 0,
      status: FurnaceStatus.IDLE,
      isRunning: false,
      currentStage: 0,
      totalStages: 0,
      error: null,
    };
    this.listeners = new Map();
  }

  /**
   * Получить текущее состояние
   */
  getState(): BoardState {
    return { ...this.state };
  }

  /**
   * Получить конфиг
   */
  getConfig(): BoardConfig {
    return { ...this.config };
  }

  /**
   * Обновить конфиг
   */
  updateConfig(newConfig: Partial<BoardConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Подписаться на изменения состояния
   */
  subscribe(listener: (state: BoardState) => void): () => void {
    const id = Math.random().toString(36).substring(7);
    if (!this.listeners.has(id)) {
      this.listeners.set(id, []);
    }
    const list = this.listeners.get(id)!;
    list.push(listener);

    // Immediately notify with current state
    listener(this.state);

    return () => {
      const l = this.listeners.get(id);
      if (l) {
        const index = l.indexOf(listener);
        if (index !== -1) {
          l.splice(index, 1);
        }
      }
    };
  }

  /**
   * Запустить печь
   */
  start(
    targetTemperature: number,
    stages?: Array<{ duration: number; temperature: number }>,
  ): void {
    if (this.state.isRunning) {
      return;
    }

    this.state.isRunning = true;
    this.state.status = FurnaceStatus.WORK;
    this.state.targetTemperature = targetTemperature;
    this.state.currentStage = 1;
    this.state.totalStages = stages?.length || 1;
    this.state.error = null;

    // Start simulation loop
    this.intervalId = setInterval(() => {
      this.simulateStep(stages);
    }, 1000);

    this.notifyListeners();
  }

  /**
   * Остановить печь
   */
  stop(): void {
    if (!this.state.isRunning) {
      return;
    }

    this.state.isRunning = false;
    this.state.status = FurnaceStatus.BUSY;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.notifyListeners();
  }

  /**
   * Сбросить состояние
   */
  reset(): void {
    this.stop();
    this.state = {
      temperature: this.config.ambientTemperature,
      targetTemperature: 0,
      status: FurnaceStatus.IDLE,
      isRunning: false,
      currentStage: 0,
      totalStages: 0,
      error: null,
    };
    this.notifyListeners();
  }

  /**
   * Проверить наличие ошибки
   */
  hasError(): boolean {
    return this.state.error !== null;
  }

  /**
   * Получить ошибку
   */
  getError(): string | null {
    return this.state.error;
  }

  /**
   * Симулировать один шаг (1 секунда)
   */
  private simulateStep(stages?: Array<{ duration: number; temperature: number }>): void {
    if (!this.state.isRunning) {
      return;
    }

    // Check for random error
    if (Math.random() < this.config.errorChance) {
      this.triggerRandomError();
      return;
    }

    // Determine target temperature based on stages
    let targetTemp = this.state.targetTemperature;
    if (stages && stages.length > 0) {
      const stageIndex = (this.state.currentStage - 1) % stages.length;
      const stage = stages[stageIndex];
      targetTemp = stage.temperature;
    }

    // Simulate temperature change
    if (this.state.temperature < targetTemp) {
      // Heating
      const tempDiff = targetTemp - this.state.temperature;
      if (tempDiff <= this.config.heatingRate) {
        this.state.temperature = targetTemp;
        this.state.status = FurnaceStatus.WORK;
      } else {
        this.state.temperature += this.config.heatingRate + (Math.random() - 0.5) * 0.5;
        this.state.status = FurnaceStatus.WORK;
      }
    } else if (this.state.temperature > targetTemp + this.config.temperatureTolerance) {
      // Cooling (shouldn't happen during operation, but for safety)
      this.state.temperature -= this.config.coolingRate;
      this.state.status = FurnaceStatus.BUSY;
    } else {
      // Maintaining
      this.state.temperature += (Math.random() - 0.5) * 0.5;
      this.state.status = FurnaceStatus.WORK;
    }

    // Update stage progress
    if (stages && stages.length > 0) {
      this.state.currentStage++;
    }

    this.notifyListeners();
  }

  /**
   * Случайная ошибка
   */
  private triggerRandomError(): void {
    const errors = [
      'Ошибка датчика температуры T1',
      'Превышение температуры камеры',
      'Неисправность ТЭН #1',
      'Отказ вентилятора конвекции',
      'Ошибка коммуникации',
    ];

    const errorMessage = errors[Math.floor(Math.random() * errors.length)];
    this.state.error = errorMessage;
    this.state.status = FurnaceStatus.ERROR;
    this.state.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.notifyListeners();
  }

  /**
   * Уведомить слушателей
   */
  private notifyListeners(): void {
    for (const [, listeners] of this.listeners) {
      for (const listener of listeners) {
        try {
          listener(this.state);
        } catch (error) {
          console.error('Error in MockBoardService listener:', error);
        }
      }
    }
  }

  /**
   * Уничтожить сервис
   */
  destroy(): void {
    this.stop();
    this.listeners.clear();
  }
}

export default MockBoardService;
