/**
 * Проверка и сериализация переносимого JSON-формата библиотеки профилей.
 */
import {
  portableProfile,
  validateProfile,
  type Profile,
  type ProfileSource,
} from '@mercury/shared';
/** Проверяет размер, формат и профили импортируемого JSON до передачи в библиотеку. */
export function parseProfileFile(text: string) {
  if (new TextEncoder().encode(text).length > 80 * 1024)
    throw new Error('Файл профилей должен быть не больше 80 КБ.');
  const data = JSON.parse(text);
  if (
    !Array.isArray(data) &&
    data?.format !== undefined &&
    (data.format !== 'mercury-profiles' || data.version !== 1)
  )
    throw new Error('Неподдерживаемый формат файла профилей.');
  const values = Array.isArray(data) ? data : data?.profiles;
  if (!Array.isArray(values) || !values.length || values.length > 200)
    throw new Error('В файле должно быть от 1 до 200 профилей.');
  values.forEach((value) => validateProfile(value));
  let source: ProfileSource | undefined;
  if (
    data?.source &&
    ['300', '400', '301', '401'].includes(data.source.model) &&
    ['230', '380'].includes(data.source.connectionVoltage)
  )
    source = {
      model: data.source.model,
      connectionVoltage: data.source.connectionVoltage,
    };
  return {
    profiles: (values as Profile[]).map(portableProfile),
    ...(source ? { source } : {}),
  };
}
/** Создаёт переносимое JSON-представление профиля без привязки к локальной записи. */
export function profileFile(profiles: Profile[], source: ProfileSource) {
  const text = JSON.stringify(
    {
      format: 'mercury-profiles',
      version: 1,
      source,
      profiles: profiles.map(portableProfile),
    },
    null,
    2,
  );
  if (new TextEncoder().encode(text).length > 80 * 1024)
    throw new Error('Для одного файла выберите меньше профилей: предел 80 КБ.');
  return text;
}
