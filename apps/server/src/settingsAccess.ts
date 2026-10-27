import { readCombinedRoles } from './ovenSettings.js';
import { Router } from 'express';
import { randomUUID } from 'node:crypto';

export function protectedSettingsRequest(
  method: string,
  path: string,
): boolean {
  path = path.toLowerCase().replace(/\/+$/, '');
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS')
    return false;
  return (
    (path.startsWith('/api/settings/') && path !== '/api/settings/keep-heat') ||
    path === '/api/config' ||
    path === '/api/controller/test-element' ||
    path === '/api/controller/convection' ||
    path.startsWith('/api/software-update/')
  );
}

export function profileMutationRequest(method: string, path: string): boolean {
  path = path.toLowerCase().replace(/\/+$/, '');
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return false;
  if (method === 'PUT' && path === '/api/profiles/selected') return false;
  return path === '/api/profiles' || path.startsWith('/api/profiles/');
}

/** Appliance access lasts for this server process, never persisted on disk. */
export function createSettingsAccessRouter(
  combinedRoles = readCombinedRoles,
  currentRunId: () => string | null = () => null,
) {
  const router = Router();
  const bootId = randomUUID();
  let unlocked = false;
  let advancedUnlocked = false;
  const status = () => {
    const combineOperatorEngineerRoles = combinedRoles();
    return {
      unlocked,
      advancedUnlocked,
      bootId,
      combineOperatorEngineerRoles,
      canEditProfiles: unlocked || combineOperatorEngineerRoles,
    };
  };
  router.get('/api/settings-access', (_request, response) => {
    response.set('Cache-Control', 'no-store').json(status());
  });
  router.post('/api/settings-access/unlock', (request, response) => {
    if (
      typeof request.body?.pin !== 'string' ||
      !['3457', '34572'].includes(request.body.pin)
    ) {
      response.status(401).json({ error: 'Неверный PIN-код' });
      return;
    }
    unlocked = true;
    advancedUnlocked = request.body.pin === '34572';
    response.json(status());
  });
  router.post('/api/settings-access/lock', (_request, response) => {
    unlocked = false;
    advancedUnlocked = false;
    response.json(status());
  });
  router.use((request, response, next) => {
    const path = request.path.toLowerCase().replace(/\/+$/, '');
    // The operator must see the current process, even while archive access is locked.
    const runId = currentRunId();
    const currentChart =
      ['GET', 'HEAD'].includes(request.method) &&
      runId !== null &&
      path === '/api/history/' + encodeURIComponent(runId).toLowerCase();
    const advancedRequest =
      path === '/api/history' ||
      (path.startsWith('/api/history/') && !currentChart) ||
      (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
        (path === '/api/config' || path === '/api/settings/fan-reference'));
    if (!advancedUnlocked && advancedRequest) {
      response
        .status(423)
        .json({ error: 'Требуется расширенный доступ к настройкам.' });
      return;
    }
    if (!unlocked && protectedSettingsRequest(request.method, request.path)) {
      response
        .status(423)
        .json({ error: 'Настройки заблокированы. Введите PIN-код.' });
      return;
    }
    if (
      !unlocked &&
      !combinedRoles() &&
      profileMutationRequest(request.method, request.path)
    ) {
      response.status(423).json({
        error:
          'Создание и редактирование профилей доступны после ввода PIN-кода.',
      });
      return;
    }
    next();
  });
  return router;
}
