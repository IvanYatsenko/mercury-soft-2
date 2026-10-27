export function profileNumericInput(
  text: string,
  min: number,
  max: number,
  integer = false,
): number {
  const normalized = text.trim().replace(',', '.');
  if (!(integer ? /^\d+$/ : /^\d+(?:\.\d+)?$/).test(normalized)) return NaN;
  const value = Number(normalized);
  return Number.isFinite(value) &&
    value >= min &&
    value <= max &&
    (!integer || Number.isInteger(value))
    ? value
    : NaN;
}
