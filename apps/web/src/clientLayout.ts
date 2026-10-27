/** Electron keeps the appliance UI at every window size. */
export function isPcLayout(userAgent: string, wide: boolean): boolean {
  return wide && !/Electron\//i.test(userAgent);
}
