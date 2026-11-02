/**
 * Синхронная работа с USB SQLite выполняется только внутри worker; отключённый накопитель не заменяется RAM или SD.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isMountedUsb } from './usbStorage.js';

export const historySchema = `
CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,profile_name TEXT NOT NULL,profile TEXT NOT NULL,started_at TEXT NOT NULL,finished_at TEXT,state TEXT NOT NULL,error TEXT,simulated INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS samples(run_id TEXT NOT NULL REFERENCES runs(id),second REAL NOT NULL,body TEXT NOT NULL,PRIMARY KEY(run_id,second));
CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,run_id TEXT NOT NULL REFERENCES runs(id),at TEXT NOT NULL,message TEXT NOT NULL);`;

// History exists only on healthy USB storage; no RAM or SD fallback.
export class HistoryStorage {
  private disk: DatabaseSync | undefined;
  private device: number | undefined;
  private maintenance = false;
  private pending: { sql: string; args: SQLInputValue[] }[] = [];
  /**
   * Открывает историю только на проверенном USB и запоминает его устройство; повреждённая база отключает запись без подмены файла.
   */
  constructor(
    private root = process.env.MERCURY_LOG_USB_MOUNT ?? '/media/flash',
    private available = isMountedUsb,
  ) {
    if (!this.available(this.root)) return;
    try {
      this.device = statSync(this.root).dev;
      const directory = join(this.root, 'mercury-logs');
      mkdirSync(directory, { recursive: true });
      this.disk = new DatabaseSync(join(directory, 'history.sqlite'));
      this.disk.exec(
        'PRAGMA auto_vacuum=FULL; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;' +
          historySchema,
      );
    } catch {
      this.disable();
    }
  }
  /**
   * Закрывает испорченный или исчезнувший USB без перенаправления записей во внутреннюю память.
   */
  private disable() {
    try {
      this.disk?.close();
    } catch {
      /* Device may have disappeared. */
    }
    this.disk = undefined;
  }
  /**
   * Повторно проверяет монтирование и идентичность устройства; флешка в том же каталоге не считается прежним накопителем.
   */
  private checkedDisk() {
    if (this.disk) {
      try {
        if (
          !this.available(this.root) ||
          statSync(this.root).dev !== this.device
        )
          throw new Error('USB unavailable');
      } catch {
        this.disable();
      }
    }
    return this.disk;
  }
  /**
   * Предоставляет ограниченный SQL-интерфейс worker. Ошибки журналирования поглощаются, чтобы не влиять на управление печью.
   */
  prepare(sql: string) {
    return {
      get: (...args: SQLInputValue[]) => {
        try {
          const disk = this.checkedDisk();
          if (disk) return disk.prepare(sql).get(...args);
        } catch {
          this.disable();
        }
        return undefined;
      },
      all: (...args: SQLInputValue[]) => {
        try {
          const disk = this.checkedDisk();
          if (disk) return disk.prepare(sql).all(...args);
        } catch {
          this.disable();
        }
        return [];
      },
      run: (...args: SQLInputValue[]) => {
        const result = { changes: 0, lastInsertRowid: 0 };
        if (this.maintenance) {
          // Bounded RAM queue: maintenance must never block control or fill RAM.
          if (this.pending.length < 1000) this.pending.push({ sql, args });
          return result;
        }
        if (this.disk) {
          try {
            this.checkedDisk()
              ?.prepare(sql)
              .run(...args);
          } catch {
            // Logging failures must not interrupt temperature control.
            this.disable();
          }
        }
        return result;
      },
    };
  }
  /**
   * Закрывает базу на время фоновой очистки; только подтверждённая пауза допускает её повторное открытие.
   */
  pauseDiskForMaintenance() {
    if (!this.checkedDisk()) return false;
    this.maintenance = true;
    this.pending = [];
    this.disable();
    return true;
  }
  /**
   * Транзакционно удаляет измерения и события перед запусками. Без исправной открытой базы возвращает false.
   */
  clearRuns() {
    const disk = this.checkedDisk();
    if (!disk || this.maintenance) return false;
    disk.exec('BEGIN IMMEDIATE');
    try {
      disk.exec('DELETE FROM samples; DELETE FROM events; DELETE FROM runs;');
      disk.exec('COMMIT');
      return true;
    } catch (error) {
      disk.exec('ROLLBACK');
      throw error;
    }
  }
  /**
   * Повторно открывает тот же USB и применяет отложенные операции одним пакетом; при ошибке отключает хранилище.
   */
  resumeDiskAfterMaintenance() {
    this.maintenance = false;
    try {
      if (!this.available(this.root) || statSync(this.root).dev !== this.device)
        throw new Error('USB unavailable');
      this.disk = new DatabaseSync(
        join(this.root, 'mercury-logs/history.sqlite'),
      );
      this.disk.exec('PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
      this.disk.exec('BEGIN IMMEDIATE');
      try {
        for (const item of this.pending)
          this.disk.prepare(item.sql).run(...item.args);
        this.disk.exec('COMMIT');
      } catch (error) {
        this.disk.exec('ROLLBACK');
        throw error;
      }
    } catch {
      this.disable();
    }
    this.pending = [];
  }
  /**
   * Освобождает соединение SQLite; постоянную историю не удаляет.
   */
  close() {
    this.disable();
  }
}
