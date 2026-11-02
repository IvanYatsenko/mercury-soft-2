/**
 * Проверка локальных сетевых адресов для поиска и обмена: произвольные внешние URL недопустимы.
 */
import { isIP } from 'node:net';
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';

export type Interfaces = Record<string, NetworkInterfaceInfo[] | undefined>;
/** Преобразует IPv4 в число для сравнения адреса с сетевой маской. */
function number(ip: string) {
  return ip.split('.').reduce((n, v) => (n * 256 + Number(v)) >>> 0, 0);
}
/**
 * Перечисляет локальные IPv4-адреса и маски для ограничения поиска своей подсетью.
 */
export function localAddresses(interfaces: Interfaces = networkInterfaces()) {
  return [
    ...new Set(
      Object.values(interfaces).flatMap((items) =>
        (items ?? [])
          .filter((v) => v.family === 'IPv4' && !v.internal)
          .map((v) => v.address),
      ),
    ),
  ];
}
/**
 * Проверяет адрес назначения до сетевого запроса, исключая произвольные внешние узлы.
 */
export function allowedOvenAddress(
  address: string,
  interfaces: Interfaces = networkInterfaces(),
) {
  if (isIP(address) !== 4) return false;
  const parts = address.split('.').map(Number);
  if (!(
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  ))
    return false;
  const ip = number(address);
  return Object.values(interfaces).some((items) =>
    (items ?? []).some((info) => {
      if (info.family !== 'IPv4' || info.internal || isIP(info.netmask) !== 4)
        return false;
      const mask = number(info.netmask),
        host = ~mask >>> 0;
      return (
        (ip & mask) >>> 0 === (number(info.address) & mask) >>> 0 &&
        (ip & host) !== 0 &&
        (ip & host) >>> 0 !== host
      );
    }),
  );
}
/**
 * Разбирает адрес из записи Avahi, сохраняя ограничения локальной сети.
 */
export function avahiAddress(
  line: string,
  interfaces: Interfaces = networkInterfaces(),
) {
  const fields = line.split(';');
  if (
    fields[0] !== '=' ||
    fields[2] !== 'IPv4' ||
    fields[4] !== '_mercury._tcp' ||
    fields[8] !== '8075'
  )
    return null;
  const address = fields[7] ?? '';
  return allowedOvenAddress(address, interfaces) ? address : null;
}
