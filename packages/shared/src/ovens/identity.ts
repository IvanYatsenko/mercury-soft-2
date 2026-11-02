/** Публичное обозначение печи зависит от выбранной размерной серии и поколения платы. */
export type ControllerBoardType = '220V' | '230V' | '380V' | 'unknown';

/** Сохраняет внутренние ключи серии и данных; возвращает номер модели для отображения. */
export function ovenModelNumber(
  family: string,
  board?: ControllerBoardType,
): string {
  if (
    (board === '230V' || board === '380V') &&
    (family === '300' || family === '400')
  )
    return family === '300' ? '301' : '401';
  return family;
}

/** Не выдаёт неизвестное поколение платы за подтверждённую старую модель. */
export function ovenModelName(
  family: string,
  board?: ControllerBoardType,
): string {
  if (!family) return 'Меркурий';
  if (!board || board === 'unknown') return `Меркурий — серия ${family}`;
  return `Меркурий-${ovenModelNumber(family, board)}`;
}

/** 230 остаётся совместимым ключом однофазных данных; пользователь видит 220 В. */
export function connectionVoltageLabel(voltage: string): string {
  return voltage === '230' ? '220' : voltage;
}

/** Старая плата допускает только однофазное подключение; новая — оба варианта. */
export function supportsConnection(
  board: ControllerBoardType | undefined,
  voltage: string,
): boolean {
  return (
    (voltage === '230' || voltage === '380') &&
    !(board === '220V' && voltage === '380')
  );
}
