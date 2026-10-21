import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

/** An existing directory is not enough: it must be a mounted USB filesystem. */
export function isMountedUsb(root: string): boolean {
  if (process.platform !== 'linux') return false;
  try {
    const path = resolve(root);
    if (!statSync(path).isDirectory()) return false;
    const mount = readFileSync('/proc/self/mountinfo', 'utf8')
      .split('\n')
      .map((line) => line.split(' '))
      .find((fields) => decodeMountPath(fields[4] ?? '') === path);
    if (!mount || !mount[5]?.split(',').includes('rw')) return false;
    const device = realpathSync(`/sys/dev/block/${mount[2]}`);
    return device.split('/').some((part) => /^usb\d+$/.test(part));
  } catch {
    return false;
  }
}

export function decodeMountPath(path: string): string {
  return path.replace(/\\([0-7]{3})/g, (_, octal: string) =>
    String.fromCharCode(parseInt(octal, 8)),
  );
}
