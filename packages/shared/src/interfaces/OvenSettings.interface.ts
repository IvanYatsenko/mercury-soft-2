/**
 * Настройки печи.
 * Доступны через меню настроек (пароль по умолчанию: 3457).
 */
export interface OvenSettings {
  /** ID настроек */
  id: string;
  /** Калибровка основной термопары (смещение в °C) */
  primarySensorCalibration: number;
  /** Калибровка дополнительной термопары (смещение в °C) */
  secondarySensorCalibration: number;
  /** Максимальная скорость нагрева (°C/сек) */
  maxHeatingRate: number;
  /** Максимальная скорость охлаждения (°C/сек) */
  maxCoolingRate: number;
  /** Максимальная температура (°C) */
  maxTemperature: number;
  /** Настройки WiFi */
  wifi: WifiSettings;
  /** Версия программного обеспечения */
  softwareVersion: string;
  /** Дата последнего обновления */
  lastUpdated: Date;
}

/** Настройки WiFi подключения */
export interface WifiSettings {
  /** SSID сети */
  ssid: string;
  /** IP-адрес печи */
  ipAddress: string;
  /** Подключена ли сеть */
  isConnected: boolean;
}
