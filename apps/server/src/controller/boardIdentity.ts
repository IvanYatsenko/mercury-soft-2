/** Последнее подтверждённое поколение платы; чтение не создаёт команд транспорта. */
import type { ControllerBoardType } from '@mercury/shared';
let detected: ControllerBoardType = 'unknown';

/** Запоминает результат существующего определения протокола, не угадывая подключение сети. */
export function rememberBoardType(board: ControllerBoardType) {
  if (board !== 'unknown') detected = board;
}

/** Возвращает последнее подтверждённое значение, сохраняя название при кратком обрыве связи. */
export function detectedBoardType() {
  return detected;
}
