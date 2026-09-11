import {
  Furnace,
  FurnaceStatus,
  Sensor,
  SensorType,
  Heater,
  HeaterType,
  ThermalProfile,
  UserRole,
  User,
} from '@mercury-soft-2/shared';

/**
 * Фейковая плата контроля.
 * Симулирует работу реальной печки Меркурий.
 * Используется для тестирования фронтенда без подключения к настоящей печи.
 */
export class MockBoardService {
  private furnace: Furnace;
  private sensors: Sensor[];
  private heaters: Heater[];
  private profiles: ThermalProfile[];
  private currentUser: User;
  private runningProfile: ThermalProfile | null = null;
  private runningStageIndex: number = 0;
  private runningStageTimeLeft: number = 0;

  constructor() {
    // Инициализация печи
    this.furnace = {
      licenseNumber: 'MRK-301-2026-001',
      ip: '192.168.1.100',
      model: 'Mercury-301',
      softwareVersion: '3.02.0',
      name: 'Меркурий-301 #1',
      description: 'Печь оплавления на линии SMD',
      status: FurnaceStatus.IDLE,
      temperature: 25, // Комнатная температура
      currentProfileId: null,
      error: null,
    };

    // Инициализация датчиков
    this.sensors = [
      {
        id: 'sensor-primary-001',
        name: 'Основная термопара',
        type: SensorType.PRIMARY,
        currentTemperature: 25,
        maxTemperature: 300,
        isActive: true,
      },
      {
        id: 'sensor-secondary-001',
        name: 'Дополнительная термопара',
        type: SensorType.SECONDARY,
        currentTemperature: 24,
        maxTemperature: 300,
        isActive: true,
      },
    ];

    // Инициализация нагревателей
    this.heaters = [
      {
        id: 'heater-top-001',
        name: 'Верхний ТЭН',
        type: HeaterType.HEATING_ELEMENT,
        isActive: false,
        power: 1500,
        temperature: 25,
      },
      {
        id: 'heater-bottom-001',
        name: 'Нижний ТЭН',
        type: HeaterType.HEATING_ELEMENT,
        isActive: false,
        power: 1500,
        temperature: 25,
      },
      {
        id: 'heater-ir-001',
        name: 'ИК-лампы',
        type: HeaterType.INFRARED_LAMP,
        isActive: false,
        power: 800,
      },
      {
        id: 'fan-convection-001',
        name: 'Вентилятор конвекции',
        type: HeaterType.CONVECTION_FAN,
        isActive: false,
        power: 200,
      },
      {
        id: 'fan-cooling-001',
        name: 'Вентилятор охлаждения',
        type: HeaterType.COOLING_FAN,
        isActive: false,
        power: 150,
      },
    ];

    // Инициализация термопрофилей
    this.profiles = [
      {
        id: 'profile-standard-001',
        name: 'Стандартный (Lead-Free)',
        stages: [
          { second: 60, temperature: 150 },
          { second: 90, temperature: 217 },
          { second: 30, temperature: 245 },
          { second: 60, temperature: 100 },
        ],
        mode: 'manual',
        useExternalSensor: false,
        shelves: { time: 60, temperature: 150 },
        createdAt: new Date('2026-01-15'),
        updatedAt: new Date('2026-01-15'),
      },
      {
        id: 'profile-lead-free-001',
        name: 'Бессвинцовый припой',
        stages: [
          { second: 45, temperature: 150 },
          { second: 75, temperature: 217 },
          { second: 20, temperature: 250 },
          { second: 45, temperature: 100 },
        ],
        mode: 'easy',
        useExternalSensor: false,
        shelves: { time: 45, temperature: 150 },
        createdAt: new Date('2026-02-10'),
        updatedAt: new Date('2026-02-10'),
      },
      {
        id: 'profile-thin-board-001',
        name: 'Тонкая плата',
        stages: [
          { second: 30, temperature: 120 },
          { second: 60, temperature: 200 },
          { second: 15, temperature: 235 },
          { second: 30, temperature: 80 },
        ],
        mode: 'manual',
        useExternalSensor: true,
        shelves: { time: 30, temperature: 120 },
        createdAt: new Date('2026-03-05'),
        updatedAt: new Date('2026-03-05'),
      },
    ];

    // Текущий пользователь (инженер)
    this.currentUser = {
      id: 'user-engineer-001',
      username: 'engineer',
      email: 'engineer@mercury.local',
      role: UserRole.ENGINEER,
      createdAt: new Date('2026-01-01'),
      lastLoginAt: new Date(),
      isActive: true,
    };
  }

  /**
   * Получить текущее состояние печи.
   */
  getFurnace(): Furnace {
    return { ...this.furnace };
  }

  /**
   * Получить список датчиков.
   */
  getSensors(): Sensor[] {
    return this.sensors.map((s) => ({ ...s }));
  }

  /**
   * Получить список нагревателей.
   */
  getHeaters(): Heater[] {
    return this.heaters.map((h) => ({ ...h }));
  }

  /**
   * Получить список термопрофилей.
   */
  getProfiles(): ThermalProfile[] {
    return this.profiles.map((p) => ({ ...p }));
  }

  /**
   * Получить текущего пользователя.
   */
  getCurrentUser(): User {
    return { ...this.currentUser };
  }

  /**
   * Запустить печь по термопрофилю.
   */
  startProfile(profileId: string): boolean {
    const profile = this.profiles.find((p) => p.id === profileId);
    if (!profile) {
      return false;
    }

    this.runningProfile = profile;
    this.runningStageIndex = 0;
    this.runningStageTimeLeft = profile.stages[0]?.second || 0;

    this.furnace.status = FurnaceStatus.WORK;
    this.furnace.currentProfileId = profileId;

    // Включаем нагреватели
    this.heaters.forEach((h) => {
      if (h.type === HeaterType.HEATING_ELEMENT) {
        h.isActive = true;
      }
    });

    return true;
  }

  /**
   * Остановить печь.
   */
  stop(): boolean {
    this.furnace.status = FurnaceStatus.IDLE;
    this.furnace.currentProfileId = null;
    this.runningProfile = null;
    this.runningStageIndex = 0;
    this.runningStageTimeLeft = 0;

    // Выключаем все нагреватели
    this.heaters.forEach((h) => {
      h.isActive = false;
    });

    return true;
  }

  /**
   * Обновить состояние (вызывать каждую секунду).
   * Симулирует изменение температуры.
   */
  update(): {
    furnace: Furnace;
    sensors: Sensor[];
    heaters: Heater[];
    progress: {
      currentStage: number;
      totalStages: number;
      timeLeft: number;
      temperature: number;
    } | null;
  } {
    // Обновляем температуру датчиков
    this.sensors.forEach((s) => {
      s.currentTemperature = this.furnace.temperature;
    });

    // Обновляем температуру нагревателей
    this.heaters.forEach((h) => {
      h.temperature = this.furnace.temperature;
    });

    // Если печь работает — симулируем процесс
    if (this.furnace.status === FurnaceStatus.WORK && this.runningProfile) {
      const currentStage = this.runningProfile.stages[this.runningStageIndex];

      if (currentStage) {
        // Уменьшаем время стадии
        this.runningStageTimeLeft--;

        // Симулируем нагрев
        const targetTemp = currentStage.temperature;
        const currentTemp = this.furnace.temperature;
        const diff = targetTemp - currentTemp;

        if (diff > 0) {
          // Нагрев
          this.furnace.temperature += diff * 0.1 + Math.random() * 2;
        } else {
          // Охлаждение
          this.furnace.temperature += diff * 0.1 - Math.random() * 1;
        }

        // Округляем до 1 знака
        this.furnace.temperature = Math.round(this.furnace.temperature * 10) / 10;

        // Если время стадии вышло — переходим к следующей
        if (this.runningStageTimeLeft <= 0) {
          this.runningStageIndex++;

          if (this.runningStageIndex < this.runningProfile.stages.length) {
            this.runningStageTimeLeft = this.runningProfile.stages[this.runningStageIndex].second;
          } else {
            // Профиль завершён
            this.stop();
          }
        }
      }
    }

    return {
      furnace: this.getFurnace(),
      sensors: this.getSensors(),
      heaters: this.getHeaters(),
      progress: this.runningProfile
        ? {
            currentStage: this.runningStageIndex + 1,
            totalStages: this.runningProfile.stages.length,
            timeLeft: this.runningStageTimeLeft,
            temperature: this.furnace.temperature,
          }
        : null,
    };
  }

  /**
   * Получить прогресс текущего профиля.
   */
  getProgress() {
    if (!this.runningProfile) {
      return null;
    }

    return {
      currentStage: this.runningStageIndex + 1,
      totalStages: this.runningProfile.stages.length,
      timeLeft: this.runningStageTimeLeft,
      temperature: this.furnace.temperature,
      currentStageTemp: this.runningProfile.stages[this.runningStageIndex]?.temperature || 0,
    };
  }
}

// Создаём единственный экземпляр (singleton)
export const mockBoard = new MockBoardService();
