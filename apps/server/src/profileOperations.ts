/**
 * Проверка запуска, перенос и совместимость профилей. Разрешение передачи не является разрешением нагрева.
 */
import { Router } from 'express';
import { ovenModelNumber } from '@mercury/shared';
import { detectedBoardType } from './controller/boardIdentity.js';
import { createHash } from 'node:crypto';
import {
  reviewProfile,
  portableProfile,
  validateProfile,
  type Profile,
  type ProfileSource,
} from '@mercury/shared';
import { findProfile, importProfileCopies } from './database.js';
import {
  getOvenModel,
  getProfileRates,
  readOvenSelection,
} from './ovenSettings.js';
import { config } from './config.js';
import { readRemoteDevice, type FleetDirectory } from './fleet.js';
/**
 * Рассчитывает предупреждения совместимости для текущей конфигурации без запуска профиля.
 */
export function profileAssessment(values: unknown, source?: ProfileSource) {
  if (!Array.isArray(values) || !values.length || values.length > 200)
    throw new Error('Выберите от 1 до 200 профилей.');
  values.forEach((value) => validateProfile(value));
  const profiles = (values as Profile[]).map(portableProfile);
  const selection = readOvenSelection();
  const model = selection && getOvenModel(selection.ovenModel);
  if (!model || !selection) throw new Error('Не выбрана конфигурация печи.');
  const rates = getProfileRates(model),
    target = {
      model: ovenModelNumber(selection.ovenModel, detectedBoardType()),
      connectionVoltage: selection.connectionVoltage,
    };
  const limit = Math.min(
    model.specifications.maximumTemperatureC,
    config.controllerMode === 'hardware'
      ? config.hardwareTemperatureLimit
      : 280,
  );
  const reviews = profiles.map((p) => ({
    name: p.name,
    ...reviewProfile(
      p,
      rates.heatingRate,
      rates.coolingRate,
      limit,
      source,
      target,
    ),
  }));
  const key = createHash('sha256')
    .update(JSON.stringify({ profiles, selection, target, rates, limit }))
    .digest('hex');
  return {
    target,
    reviews,
    reviewKey: key,
    valid: reviews.every((v) => v.valid),
    hasWarnings: reviews.some((v) => v.warnings.length > 0),
  };
}
/**
 * Выполняет ограниченный по времени запрос к предварительно проверенному адресу другой печи.
 */
async function remoteRequest(address: string, path: string, body: unknown) {
  const response = await fetch(`http://${address}:8075${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
    redirect: 'error',
  });
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Пустой ответ получателя.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 100000) throw new Error('Слишком большой ответ получателя.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const text = Buffer.concat(chunks).toString('utf8');
  const result = JSON.parse(text);
  if (!response.ok)
    throw new Error(result.error ?? 'Получатель отклонил запрос');
  return result;
}
/**
 * Определяет источник передаваемого профиля для проверки совместимости оборудования.
 */
function originSource(value: unknown): ProfileSource | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  return ['300', '400', '301', '401'].includes(String(v.model)) &&
    ['230', '380'].includes(String(v.connectionVoltage))
    ? { model: String(v.model), connectionVoltage: String(v.connectionVoltage) }
    : undefined;
}
/**
 * Требует явного подтверждения предупреждений перед действием, для которого оно предусмотрено.
 */
function assertAccepted(
  body: Record<string, unknown>,
  assessment: ReturnType<typeof profileAssessment>,
) {
  if (body.reviewKey !== assessment.reviewKey)
    throw new Error('Профиль или конфигурация изменились. Повторите проверку.');
  if (!assessment.valid)
    throw new Error(assessment.reviews.flatMap((v) => v.errors).join(' '));
  if (assessment.hasWarnings && body.acceptWarnings !== true)
    throw new Error('Подтвердите предупреждения перед сохранением.');
}
/**
 * Регистрирует обзор совместимости и обмен профилями; полученная копия не запускается автоматически.
 */
export function createProfileOperationsRouter(
  fleet: FleetDirectory,
  controlling: () => boolean,
) {
  const router = Router();
  router.get('/api/run/preview', (req, res) => {
    try {
      const profile = findProfile(String(req.query.profileId));
      res
        .set('Cache-Control', 'no-store')
        .json({ ...profileAssessment([profile]), profileName: profile.name });
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : 'Не удалось проверить профиль',
      });
    }
  });
  router.post('/api/profiles/import-preview', (req, res) => {
    try {
      res.json(
        profileAssessment(req.body?.profiles, originSource(req.body?.source)),
      );
    } catch (e) {
      res
        .status(400)
        .json({ error: e instanceof Error ? e.message : 'Ошибка проверки' });
    }
  });
  router.post('/api/profiles/batch-import', (req, res) => {
    try {
      if (controlling())
        throw new Error('Дождитесь завершения работы печи перед импортом.');
      const assessment = profileAssessment(
        req.body?.profiles,
        originSource(req.body?.source),
      );
      assertAccepted(req.body, assessment);
      res.json({ profiles: importProfileCopies(req.body.profiles) });
    } catch (e) {
      res.status(409).json({
        error:
          e instanceof Error ? e.message : 'Не удалось импортировать профили',
      });
    }
  });
  router.post('/api/profile-transfer/review', (req, res) => {
    try {
      res.json(
        profileAssessment(req.body?.profiles, originSource(req.body?.source)),
      );
    } catch (e) {
      res.status(400).json({
        error: e instanceof Error ? e.message : 'Несовместимый профиль',
      });
    }
  });
  router.post('/api/profile-transfer/receive', (req, res) => {
    try {
      if (controlling())
        throw new Error(
          'Печь-получатель выполняет процесс. Передача недоступна.',
        );
      const assessment = profileAssessment(
        req.body.profiles,
        originSource(req.body.source),
      );
      assertAccepted(req.body, assessment);
      res.json({ profiles: importProfileCopies(req.body.profiles) });
    } catch (e) {
      res
        .status(409)
        .json({ error: e instanceof Error ? e.message : 'Передача отклонена' });
    }
  });
  for (const action of ['transfer-preview', 'transfer'])
    router.post('/api/profiles/:id/' + action, async (req, res) => {
      try {
        const address = fleet.knownRemote(req.body?.address);
        await readRemoteDevice(address);
        const profile = findProfile(String(req.params.id)),
          selection = readOvenSelection();
        const source = selection
          ? {
              model: ovenModelNumber(selection.ovenModel, detectedBoardType()),
              connectionVoltage: selection.connectionVoltage,
            }
          : undefined;
        res.json(
          await remoteRequest(
            address,
            action === 'transfer-preview'
              ? '/api/profile-transfer/review'
              : '/api/profile-transfer/receive',
            {
              profiles: [portableProfile(profile)],
              source,
              ...(action === 'transfer'
                ? {
                    reviewKey: req.body.reviewKey,
                    acceptWarnings: req.body.acceptWarnings,
                  }
                : {}),
            },
          ),
        );
      } catch (e) {
        res.status(409).json({
          error:
            e instanceof Error
              ? e.message
              : 'Нет подтверждения передачи. Проверьте список профилей получателя перед повтором.',
        });
      }
    });
  return router;
}
