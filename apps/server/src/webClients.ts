import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Router, static as serveStatic } from 'express';

/** PC files are independent from the frozen appliance bundle. */
export function createWebClientsRouter(
  panelDirectory: string,
  pcDirectory: string,
) {
  const router = Router();
  router.get('/', (request, response, next) => {
    const index = join(pcDirectory, 'index.html');
    if (
      /Electron\//i.test(request.get('User-Agent') ?? '') ||
      !existsSync(index)
    ) {
      next();
      return;
    }
    response.set('Cache-Control', 'no-store').sendFile(index);
  });
  router.use('/pc', serveStatic(pcDirectory));
  router.use(serveStatic(panelDirectory));
  return router;
}
