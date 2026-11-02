/**
 * Гистерезис охлаждения электроники и преобразование независимого внутреннего датчика платы.
 */
/** Preserve hysteresis and keep cooling on if its temperature is unknown. */
export function coolingDemand(
  temperature: number | null,
  enabled: boolean | undefined,
  on: number,
  off: number,
) {
  if (temperature === null || !Number.isFinite(temperature)) return true;
  return temperature > on
    ? true
    : temperature < off
      ? false
      : (enabled ?? true);
}

/**
 * Декодирует температуру процессора контрольной платы с учётом версии протокола. Это не термопара камеры или изделия.
 */
export function controllerTemperature(
  data: unknown,
  protocol: number,
): number | null {
  const raw = Array.isArray(data) ? data[0] : undefined;
  return typeof raw === 'number' && Number.isFinite(raw)
    ? raw / (protocol >= 2 ? 1 : 32)
    : null;
}

/** i6 in the old app: low-voltage output 5, not an oven cooling/HV output. */
export function controllerFanValues(
  original: unknown,
  enabled: boolean,
): number[] {
  if (
    !Array.isArray(original) ||
    ![6, 8].includes(original.length) ||
    original.some((v) => ![0, 1, false, true].includes(v))
  )
    throw new Error('Неверный ответ setLV.');
  const values = original.map(Number);
  values[5] = Number(enabled);
  return values;
}
