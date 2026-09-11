/** Единицы измерения температуры */
export type UnitTemperatureEntity = 'K' | 'C' | 'F';

/**
 * Температура с единицей измерения.
 * Пример: { value: 250, unit: 'C' }
 */
export interface Temperature {
  value: number;
  unit: UnitTemperatureEntity;
}
