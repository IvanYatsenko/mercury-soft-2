/**
 * Совместимый снимок мониторинга на отдельном порту; чтение статуса не меняет состояние печи.
 */
import express from 'express';
import type { Server } from 'node:http';
import type { ControllerConnectionCheck } from './controller/checkControllerConnection.js';
import type { OvenEvent } from './ovenEvents.js';
import type { RunStatus } from '@mercury/shared';

type ErrorKey =
  'profileError' | 'fanError' | 'doorError' | 'ovenTempError' | 'itmpError';
type Run = RunStatus & {
  second: number;
  timeHorizon: number;
  acknowledged: boolean;
  profile: object;
  maximumDeviationC?: number;
  doorOpen?: boolean;
};
type Options = {
  referenceHz: number;
  fanWarnings: boolean;
  coreTemperatureC: number | null;
  controllerTemperatureC: number | null;
  version: string;
  shuttingDown?: boolean;
  raspberryFan?: boolean | null;
  controllerFan?: boolean | null;
};
/**
 * Создаёт независимый набор нулевых счётчиков совместимого мониторинга.
 */
const zeroErrors = () => ({
  profileError: 0,
  fanError: 0,
  doorError: 0,
  ovenTempError: 0,
  itmpError: 0,
});

/** Live compatibility metrics, never a run history or a controller command path. */
export class LegacyMonitoring {
  private board: ControllerConnectionCheck | null = null;
  private observedAt = 0;
  private observedOptions: Options | null = null;
  private errors = zeroErrors();
  private activeErrors = new Set<ErrorKey>();
  private profileMismatch = false;
  /**
   * Создаёт экземпляр с явно переданными зависимостями и начальным состоянием.
   */
  constructor(
    private run: () => Run,
    private options: () => Options,
    private now = Date.now,
    private unavailable = () => false,
  ) {}
  /**
   * Преобразует событие процесса в счётчики и статус совместимого мониторинга.
   */
  private signal(key: ErrorKey, on: boolean) {
    if (on && !this.activeErrors.has(key)) this.errors[key]++;
    if (on) this.activeErrors.add(key);
    else this.activeErrors.delete(key);
  }
  /** Обновляет совместимый снимок измерений и фактических индикаторов платы. */
  observe(board: ControllerConnectionCheck) {
    this.board = structuredClone(board);
    this.observedAt = this.now();
    const run = this.run(),
      options = this.options();
    this.observedOptions = options;
    const active = ['preparing', 'running', 'cooling'].includes(run.state);
    const frequency = board.telemetry?.convectionFanHz;
    this.signal('itmpError', !board.connected);
    this.signal('doorError', active && board.doorOpen === true);
    this.signal('ovenTempError', Boolean((board.state ?? 0) & (4 | 8)));
    this.signal(
      'fanError',
      options.fanWarnings &&
        board.telemetry?.convection === true &&
        options.referenceHz > 0 &&
        typeof frequency === 'number' &&
        frequency >= 0 &&
        frequency < options.referenceHz * 0.5,
    );
    if (!this.profileMismatch && (run.maximumDeviationC ?? 0) > 4) {
      this.errors.profileError++;
      this.profileMismatch = true;
    }
  }
  /** Учитывает событие процесса в статусе и счётчиках ошибок старого протокола. */
  event(event: OvenEvent) {
    if (event.kind === 'started') {
      this.errors = zeroErrors();
      this.activeErrors.clear();
      this.profileMismatch = false;
    }
    if (
      (event.kind === 'cycleCompleted' || event.kind === 'completed') &&
      event.matched === false &&
      !this.profileMismatch
    ) {
      this.errors.profileError++;
      this.profileMismatch = true;
    }
    if (event.kind === 'connectionLost') this.signal('itmpError', true);
    if (event.kind === 'error') {
      const message = event.message ?? '';
      if (/связ|ITMP|порт|timeout/iu.test(message))
        this.signal('itmpError', true);
      else if (/перегрев|терм|температур/iu.test(message))
        this.signal('ovenTempError', true);
      else if (/вентил|оборот/iu.test(message)) this.signal('fanError', true);
      else if (/двер/iu.test(message)) this.signal('doorError', true);
      else this.signal('profileError', true);
    }
  }
  /**
   * Собирает совместимый JSON-ответ из актуальной телеметрии и состояния процесса.
   */
  response() {
    const run = this.run(),
      options = this.observedOptions,
      board = this.board;
    if (
      !options ||
      !board?.connected ||
      this.unavailable() ||
      this.now() - this.observedAt > 6500 ||
      options.shuttingDown
    )
      return null;
    const active = ['preparing', 'running', 'cooling'].includes(run.state);
    const status = active
      ? 'busy'
      : run.id &&
          !run.acknowledged &&
          ['completed', 'stopped', 'failed'].includes(run.state)
        ? 'finish'
        : 'idle';
    const telemetry = board.telemetry;
    /**
     * Преобразует группу фактических выходов в числовой индикатор старого протокола.
     */
    const output = (value: boolean | null | undefined) => (value ? 100 : 0);
    const hz = telemetry?.convectionFanHz ?? 0;
    return {
      profile: status === 'idle' ? {} : run.profile,
      heatIndicators: {
        tens: output(telemetry?.heaters),
        IR: output(telemetry?.lamps),
        convection: output(telemetry?.convection),
        fans: output(telemetry?.fans),
      },
      status,
      state: {
        coreTemp:
          options.coreTemperatureC === null
            ? ''
            : `${options.coreTemperatureC.toFixed(2)}°C`,
        timeHorizon: active ? Math.max(0, Math.ceil(run.timeHorizon)) : 0,
        temperature: options.controllerTemperatureC ?? 0,
        convFreq: {
          Hz: hz,
          rel: options.referenceHz > 0 ? hz / options.referenceHz : 0,
        },
        second: Math.max(0, Math.floor(run.second)),
        i: { door: board.doorOpen ?? false },
        sensors: {
          door: board.doorOpen ?? false,
          fan220_2: board.doorOpen ?? false,
        },
        profileName: status === 'idle' ? '' : (run.profileName ?? ''),
        indicators: [
          Number(!!((board.state ?? 0) & (4 | 8 | 64 | 128))),
          Number(!board.ready),
          Number(board.ready === true),
          0,
          Number(options.raspberryFan === true),
          Number(options.controllerFan === true),
          0,
          0,
        ],
      },
      progress: [],
      errorStore: { ...this.errors },
      version: options.version,
    };
  }
}

/**
 * Регистрирует совместимое чтение состояния и внешние команды на отдельном маршрутизаторе.
 */
export function monitoringRouter(monitor: LegacyMonitoring) {
  const router = express.Router();
  router.get('/status', (_request, response) => {
    response.set('Cache-Control', 'no-store');
    const status = monitor.response();
    if (!status) {
      response.status(503).json({ error: 'Нет актуальных данных платы.' });
      return;
    }
    response.json(status);
  });
  router.all('/status', (_request, response) =>
    response
      .status(405)
      .set('Allow', 'GET, HEAD')
      .json({ error: 'Мониторинг доступен только для чтения.' }),
  );
  return router;
}
/**
 * Запускает отдельный HTTP-сервер мониторинга и возвращает ресурс для штатного закрытия.
 */
export function startLegacyMonitoring(
  monitor: LegacyMonitoring,
  host: string,
  port: number,
  commands?: express.Router,
): Server {
  const app = express();
  app.disable('x-powered-by');
  app.use(monitoringRouter(monitor));
  if (commands) app.use(commands);
  app.use((_request, response) =>
    response.status(404).json({ error: 'Not found' }),
  );
  const server = app.listen(port, host, () =>
    console.log(`Monitoring: http://${host}:${port}/status`),
  );
  server.on('error', (error) =>
    console.warn('Monitoring listener unavailable:', error.message),
  );
  return server;
}
