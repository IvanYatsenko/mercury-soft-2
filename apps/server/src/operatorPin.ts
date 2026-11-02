/**
 * Проверка и изменение операторского PIN; внутренний уровень доступа не подменяется пользовательским кодом.
 */
import { promisify } from 'node:util';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { readOperatorPinHash, updateConfig } from './ovenSettings.js';

const derive = promisify(scrypt);
let revision = 0;

export const advancedPin = '34572';
/**
 * Проверяет допустимый формат нового операторского PIN до сохранения.
 */
export function validOperatorPin(value: unknown) {
  return (
    typeof value === 'string' &&
    /^\d{4,5}$/.test(value) &&
    value !== advancedPin
  );
}
/**
 * Сравнивает введённое значение с текущим операторским кодом печи.
 */
export async function checkOperatorPin(value: unknown): Promise<boolean> {
  const checkedRevision = revision;
  if (typeof value !== 'string' || !/^\d{4,5}$/.test(value)) return false;
  const stored = readOperatorPinHash();
  if (!stored) return value === '3457';
  try {
    const expected = Buffer.from(stored.hash, 'hex');
    const actual = (await derive(value, stored.salt, 32)) as Buffer;
    return (
      revision === checkedRevision &&
      expected.length === actual.length &&
      timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}
/**
 * Определяет уровень доступа без изменения прав других клиентов.
 */
export async function checkAccessPin(value: unknown) {
  return value === advancedPin || (await checkOperatorPin(value));
}
/**
 * Сохраняет новый операторский код в конфигурации печи; внутренний доступ не изменяется.
 */
export async function saveOperatorPin(value: unknown) {
  if (!validOperatorPin(value)) throw Error('Недопустимый PIN-код.');
  const salt = randomBytes(16).toString('hex');
  await updateConfig({
    operatorPin: {
      salt,
      hash: ((await derive(value as string, salt, 32)) as Buffer).toString(
        'hex',
      ),
    },
  });
  revision++;
}
