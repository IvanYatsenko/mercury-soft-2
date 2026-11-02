/**
 * Калибровочный процесс через общий исполнитель профилей; сохранение доступно только для своей завершённой стабильной точки.
 */
import { Router } from 'express';
import {
  type Profile,
  type RunStatus,
  rateAtTemperature,
} from '@mercury/shared';
import {
  calibrationKey,
  calibrationSensor,
  readCalibration,
  saveCalibration,
  resetCalibration,
  type CalibrationSensor,
} from './temperatureCalibration.js';
import {
  getOvenModel,
  getProfileRates,
  readOvenSelection,
} from './ovenSettings.js';

/**
 * Регистрирует калибровку выбранного датчика с обычным доступом настроек. Нагрев запускается только POST start; GET и сохранение таблицы его не включают.
 */
export function createCalibrationRouter(runner: {
  controlling(): boolean;
  snapshot(): RunStatus;
  start(
    profile: Profile,
    maximumResponse: boolean,
    prepare: boolean,
    calibration: boolean,
  ): Promise<RunStatus>;
  stop(): Promise<RunStatus>;
}) {
  const router = Router();
  let session: null | {
    runId: string;
    sensor: CalibrationSensor;
    target: number;
    key: string;
    saved: boolean;
  } = null;
  let changing = false;
  /**
   * Связывает текущий runId с процедурой и вычисляет право сохранить измерение: завершённая выдержка, минимум 20 секунд стабильности и отсутствие активного управления.
   */
  function status() {
    const run = runner.snapshot();
    const current =
      session && run.id === session.runId && run.purpose === 'calibration'
        ? session
        : null;
    return {
      key: calibrationKey(),
      tables: {
        chamber: readCalibration('chamber'),
        board: readCalibration('board'),
      },
      session: current,
      run: current ? run : null,
      canSave:
        !!current &&
        !current.saved &&
        run.state === 'completed' &&
        !runner.controlling() &&
        (run.calibrationStableSeconds ?? 0) >= 20 &&
        run.measuredTemperatureC !== null &&
        Math.abs(run.measuredTemperatureC - current.target) <= 3 &&
        typeof run.rawMeasuredTemperatureC === 'number' &&
        Number.isFinite(run.rawMeasuredTemperatureC),
    };
  }
  router.get('/api/settings/calibration', (_req, res) => {
    try {
      res.set('Cache-Control', 'no-store').json(status());
    } catch (e) {
      res.status(409).json({ error: String(e) });
    }
  });
  for (const action of ['start', 'save', 'stop', 'reset'] as const) {
    router.post('/api/settings/calibration/' + action, async (req, res) => {
      if (changing) {
        res
          .status(409)
          .json({ error: 'Дождитесь завершения операции калибровки.' });
        return;
      }
      changing = true;
      try {
        if (action === 'start') {
          if (runner.controlling())
            throw Error('Остановите профиль и поддержание перед калибровкой.');
          const sensor = calibrationSensor(req.body?.sensor),
            target = req.body?.target;
          if (
            !Number.isInteger(target) ||
            target < 60 ||
            target > 260 ||
            target % 5
          )
            throw Error('Температура калибровки: 60–260 °C с шагом 5 °C.');
          const selection = readOvenSelection(),
            model = selection && getOvenModel(selection.ovenModel);
          if (!model) throw Error('Не выбрана модель печи.');
          const rates = getProfileRates(model);
          const seconds = Math.max(
            60,
            Math.ceil(
              (target - 50) /
                Math.max(0.05, rateAtTemperature(rates.heatingRate, target)),
            ),
          );
          const profile: Profile = {
            name: `Калибровка ${sensor === 'board' ? 'датчика на плате' : 'датчика камеры'} ${target} °C`,
            board: sensor === 'board',
            mode: 'manual',
            repeat: 1,
            points: [
              { second: 0, temperature: 50 },
              { second: seconds, temperature: target },
              { second: 60, temperature: target },
            ],
            shelves: [
              { second: 60, temperature: target },
              { second: 60, temperature: target },
              { second: 0, temperature: target },
            ],
          };
          const key = calibrationKey();
          const run = await runner.start(profile, false, true, true);
          if (!run.id) throw Error('Не удалось начать калибровку.');
          session = { runId: run.id, sensor, target, key, saved: false };
        } else if (action === 'stop') {
          if (
            !session ||
            req.body?.runId !== session.runId ||
            runner.snapshot().id !== session.runId
          )
            throw Error('Процесс калибровки уже изменился.');
          await runner.stop();
          session = null;
        } else {
          if (runner.controlling())
            throw Error(
              'Дождитесь остановки нагрева перед изменением калибровки.',
            );
          if (action === 'reset') {
            await resetCalibration(calibrationSensor(req.body?.sensor));
            session = null;
          } else {
            const current = status();
            if (
              !session ||
              req.body?.runId !== session.runId ||
              session.key !== calibrationKey() ||
              !current.canSave
            )
              throw Error(
                'Нет завершённой стабильной точки для сохранения. Повторите калибровку.',
              );
            await saveCalibration(session.sensor, {
              target: session.target,
              raw: runner.snapshot().rawMeasuredTemperatureC!,
              measured: req.body?.measured,
            });
            session.saved = true;
          }
        }
        res.json(status());
      } catch (e) {
        res
          .status(409)
          .json({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        changing = false;
      }
    });
  }
  return router;
}
