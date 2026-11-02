/**
 * Раздельная калибровка термопар; атомарный файл рядом с config.json переживает замену каталога программы.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { readOvenSelection, configurationDirectory } from './ovenSettings.js';
import { detectedBoardType } from './controller/boardIdentity.js';

export type CalibrationSensor = 'chamber' | 'board';
export type TemperatureCalibrationPoint = {
  target: number;
  raw: number;
  measured: number;
};
/**
 * Принимает только явный выбор chamber или board; отсутствие выбора не должно подставлять датчик автоматически.
 */
export function calibrationSensor(value: unknown): CalibrationSensor {
  if (value !== 'chamber' && value !== 'board')
    throw Error('Выберите датчик камеры или датчик на плате.');
  return value;
}
/**
 * Разделяет таблицы по модели и подключению, чтобы после смены конфигурации не применять чужие поправки.
 */
export function calibrationKey() {
  const selection = readOvenSelection();
  if (!selection) throw Error('Сначала выберите конфигурацию печи.');
  // Прежние ключи принадлежат уже испытанным новым платам; старую плату отделяем.
  return `${selection.ovenModel}-${selection.connectionVoltage}${detectedBoardType() === '220V' ? '-legacy' : ''}`;
}
type CalibrationFile = Record<
  string,
  Partial<Record<CalibrationSensor, TemperatureCalibrationPoint[]>>
>;
/**
 * Возвращает путь temperature-calibration.json вне устанавливаемого пакета программы.
 */
export function calibrationFilePath() {
  return join(configurationDirectory(), 'temperature-calibration.json');
}
let cached: { path: string; data: CalibrationFile } | undefined;
/**
 * Читает и проверяет корень файла, затем использует кэш на горячем пути измерений; fresh нужен перед очередной записью.
 */
function stored(fresh = false): CalibrationFile {
  const path = calibrationFilePath();
  if (!fresh && cached?.path === path) return cached.data;
  const data = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw Error('Повреждён файл калибровки.');
  cached = { path, data };
  return data;
}
let writes: Promise<void> = Promise.resolve();
/**
 * Последовательно применяет изменения к актуальному файлу и атомарно заменяет его. Ошибка одной записи не блокирует следующие попытки.
 */
function writeCalibration(change: (all: CalibrationFile) => CalibrationFile) {
  const operation = writes.then(async () => {
    const path = calibrationFilePath(),
      temporary = path + '.' + randomUUID() + '.tmp';
    try {
      const data = change(stored(true));
      await writeFile(temporary, JSON.stringify(data, null, 2) + '\n', {
        mode: 0o600,
      });
      await rename(temporary, path);
      cached = { path, data };
    } finally {
      await rm(temporary, { force: true });
    }
  });
  writes = operation.catch(() => {});
  return operation;
}
/**
 * Проверяет диапазоны, уникальность уставок и монотонность измерений; пересекающаяся таблица не должна инвертировать регулирование.
 */
export function validateCalibrationPoints(
  value: unknown,
): asserts value is TemperatureCalibrationPoint[] {
  if (!Array.isArray(value) || value.length > 41)
    throw Error('Некорректная таблица калибровки.');
  let lastRaw = 0,
    lastMeasured = 0;
  const targets = new Set<number>();
  for (const point of [...value].sort((a, b) => a.raw - b.raw)) {
    if (
      !Number.isInteger(point.target) ||
      point.target < 60 ||
      point.target > 260 ||
      point.target % 5 ||
      !Number.isFinite(point.raw) ||
      point.raw <= 0 ||
      point.raw >= 280 ||
      !Number.isInteger(point.measured) ||
      Math.abs(point.measured - point.target) >= 20 ||
      Math.abs(point.measured - point.raw) >= 40 ||
      point.raw - lastRaw < 0.5 ||
      point.measured <= lastMeasured ||
      targets.has(point.target)
    )
      throw Error(
        'Некорректная поправка: проверьте измерение и соседние точки таблицы.',
      );
    lastRaw = point.raw;
    lastMeasured = point.measured;
    targets.add(point.target);
  }
}
/**
 * Возвращает копию таблицы конкретного датчика текущей конфигурации; без сохранённых поправок результат пустой.
 */
export function readCalibration(sensor: CalibrationSensor) {
  const points = stored()[calibrationKey()]?.[sensor] ?? [];
  validateCalibrationPoints(points);
  return points.map((p) => ({ ...p }));
}
/**
 * Линейно переводит исходное измерение в откалиброванное. Пограничные и невалидные значения не маскируются поправкой.
 */
export function correctTemperature(
  raw: number | null,
  sensor: CalibrationSensor,
): number | null {
  if (
    raw === null ||
    !Number.isFinite(raw) ||
    raw <= 0 ||
    raw >= 300 ||
    !readOvenSelection()
  )
    return raw;
  const points = readCalibration(sensor);
  if (!points.length) return raw;
  const anchors = [
    { raw: 0, measured: 0 },
    ...points.map((p) => ({ raw: p.raw, measured: p.measured })),
    { raw: 300, measured: 300 },
  ].sort((a, b) => a.raw - b.raw);
  const next = anchors.findIndex((p) => p.raw >= raw);
  const a = anchors[next - 1]!,
    b = anchors[next]!;
  return (
    a.measured + ((raw - a.raw) / (b.raw - a.raw)) * (b.measured - a.measured)
  );
}
/**
 * Заменяет одну уставку выбранного датчика в сериализованной записи; проверяет весь новый ряд, сохраняя остальные датчики и конфигурации.
 */
export async function saveCalibration(
  sensor: CalibrationSensor,
  point: TemperatureCalibrationPoint,
) {
  const key = calibrationKey();
  await writeCalibration((all) => {
    const current = all[key]?.[sensor] ?? [];
    validateCalibrationPoints(current);
    const points = [
      ...current.filter((p) => p.target !== point.target),
      point,
    ].sort((a, b) => a.raw - b.raw);
    validateCalibrationPoints(points);
    return { ...all, [key]: { ...all[key], [sensor]: points } };
  });
}
/**
 * Удаляет поправки только выбранного датчика текущей конфигурации; библиотека профилей и история не затрагиваются.
 */
export async function resetCalibration(sensor: CalibrationSensor) {
  const key = calibrationKey();
  await writeCalibration((all) => ({
    ...all,
    [key]: { ...all[key], [sensor]: [] },
  }));
}
