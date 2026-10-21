// Mirror the old IRProtector: remove outputs before adding them, with a
// break longer than 5 ms and at least 500 ms between lamp enable commands.
export class LampOutputProtection {
  private lastEnabledAt = -Infinity;
  private lastDisabledAt = -Infinity;

  constructor(
    private now = () => performance.now(),
    private sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ) {}

  async apply(
    previous: number[],
    next: number[],
    lampIndices: number[],
    write: (values: number[]) => Promise<void>,
    verify: () => Promise<void>,
  ) {
    const removed = lampIndices.filter(
      (index) => previous[index] && !next[index],
    );
    const added = lampIndices.filter(
      (index) => !previous[index] && next[index],
    );
    if (removed.length && added.length) {
      const intermediate = [...next];
      for (const index of added) intermediate[index] = 0;
      await write(intermediate);
      this.lastDisabledAt = this.now();
    }
    const intermediate = [...next];
    for (const index of added) intermediate[index] = 0;
    if (added.length) {
      // After a restart the previous enable time is unknown; wait conservatively.
      if (
        !Number.isFinite(this.lastEnabledAt) &&
        lampIndices.some((i) => previous[i])
      )
        this.lastEnabledAt = this.now();
      for (const index of added) {
        while (true) {
          const delay = Math.max(
            this.lastDisabledAt + 6 - this.now(),
            this.lastEnabledAt + 500 - this.now(),
          );
          if (delay <= 0) break;
          await this.sleep(delay);
        }
        await verify();
        intermediate[index] = next[index]!;
        await write([...intermediate]);
        this.lastEnabledAt = this.now();
      }
      return;
    }
    await write(next);
    if (removed.length) this.lastDisabledAt = this.now();
  }
}
