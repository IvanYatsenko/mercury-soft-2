/**
 * Ограниченное окно восстановления PIN при штатном выключении; подтверждение предшествует завершению питания.
 */
/** Physical shutdown recovery is armed only while the local panel's PIN dialog is open. */
export class PinRecovery {
  private armed = '';
  private touched = 0;
  private owner = '';
  private deadline = 0;
  private finishWait: (() => void) | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /**
   * Создаёт экземпляр с явно переданными зависимостями и начальным состоянием.
   */
  constructor(
    private windowMs = 15000,
    private now = Date.now,
  ) {}
  /**
   * Разрешает короткое окно восстановления только после нужной последовательности действий на локальной панели.
   */
  arm(client: string, open: boolean) {
    if (open && !this.owner) {
      this.armed = client;
      this.touched = this.now();
    }
    if (!open && this.armed === client) this.armed = '';
  }
  /**
   * Формирует состояние операции для интерфейса; само чтение не запускает процесс.
   */
  status(client: string) {
    if (this.armed === client) this.touched = this.now();
    return {
      pending: this.owner === client && this.deadline > this.now(),
      remainingSeconds:
        this.owner === client
          ? Math.max(0, Math.ceil((this.deadline - this.now()) / 1000))
          : 0,
    };
  }
  /**
   * Запускает отсчёт штатного выключения с ограниченным временем ввода восстановления.
   */
  beginShutdown(): Promise<void> | null {
    if (!this.armed || this.now() - this.touched > 5000 || this.owner)
      return null;
    this.owner = this.armed;
    this.armed = '';
    this.deadline = this.now() + this.windowMs;
    return new Promise((resolve) => {
      this.finishWait = () => {
        clearTimeout(this.timer);
        this.owner = '';
        this.deadline = 0;
        this.finishWait = undefined;
        resolve();
      };
      this.timer = setTimeout(() => this.finishWait?.(), this.windowMs);
    });
  }
  /**
   * Проверяет право текущей попытки завершить процедуру восстановления.
   */
  claim(client: string, code: unknown) {
    if (
      code !== '88888888' ||
      this.owner !== client ||
      this.deadline <= this.now()
    )
      return false;
    clearTimeout(this.timer);
    this.deadline = 0;
    return true;
  }
  /**
   * Завершает однократную процедуру и очищает её временное состояние.
   */
  complete() {
    this.finishWait?.();
  }
}
export const pinRecovery = new PinRecovery();
/**
 * Выделяет только необходимые маршруты восстановления среди заблокированных при выключении команд.
 */
export function allowDuringShutdown(
  path: string,
  shuttingDown: boolean,
  terminating: boolean,
) {
  return (
    !terminating &&
    (!shuttingDown ||
      /^\/api\/settings-access\/recovery(?:\/(?:arm|reset))?\/?$/i.test(path))
  );
}
