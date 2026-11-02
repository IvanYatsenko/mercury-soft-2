/**
 * Внешние команды JSON-профилей: отдельная проверка доступа, валидация и общий исполнитель процесса.
 */
import express from 'express';
import { randomUUID } from 'node:crypto';
import {
  validateProfile,
  portableProfile,
  type Profile,
} from '@mercury/shared';

/**
 * Регистрирует запуск JSON-профиля и остановку с отдельной проверкой права интеграции.
 */
export function monitoringCommands(options: {
  pin: string;
  unavailable: () => boolean;
  assess: (profiles: Profile[]) => {
    valid: boolean;
    hasWarnings: boolean;
    reviews: { errors: string[] }[];
  };
  start: (profile: Profile) => Promise<unknown>;
  stop: () => Promise<unknown>;
}) {
  const router = express.Router();
  const json = express.json({ limit: '256kb' });
  for (const action of ['start', 'stop'] as const) {
    router.post(`/profile/${action}`, json, async (req, res) => {
      res.set('Cache-Control', 'no-store');
      if ((req.get('X-Mercury-Pin') ?? req.body?.pin) !== options.pin) {
        res.status(423).json({ error: 'Требуется расширенный PIN-код.' });
        return;
      }
      if (options.unavailable()) {
        res
          .status(503)
          .json({ error: 'Приложение завершает работу или обновляется.' });
        return;
      }
      if (action === 'stop') {
        try {
          res.json(await options.stop());
        } catch (e) {
          res.status(409).json({ error: String(e) });
        }
        return;
      }
      let profile: Profile;
      try {
        const value = req.body?.profile ?? req.body;
        validateProfile(value);
        profile = { ...portableProfile(value), id: randomUUID() };
        const compatibility = req.get('X-Mercury-Accept-Warnings');
        if (
          compatibility !== undefined &&
          !['true', 'false'].includes(compatibility)
        )
          throw new Error(
            'X-Mercury-Accept-Warnings должен быть true или false.',
          );
        if (compatibility !== 'false') {
          const assessment = options.assess([profile]);
          if (!assessment.valid) {
            res.status(400).json({
              error: assessment.reviews.flatMap((v) => v.errors).join(' '),
              assessment,
            });
            return;
          }
          if (assessment.hasWarnings && req.body?.acceptWarnings !== true) {
            res.status(409).json({
              error: 'Подтвердите предупреждения перед запуском.',
              assessment,
            });
            return;
          }
        }
      } catch (e) {
        res.status(400).json({ error: String(e) });
        return;
      }
      try {
        res.json(await options.start(profile));
      } catch (e) {
        res.status(409).json({ error: String(e) });
      }
    });
  }
  router.use(
    (
      error: { status?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res
        .status(error.status === 413 ? 413 : 400)
        .json({ error: 'Некорректный или слишком большой JSON.' });
    },
  );
  return router;
}
