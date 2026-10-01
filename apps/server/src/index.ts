import { fileURLToPath } from 'node:url';
import express from 'express';
import {
  checkControllerConnection,
  initializeControllerConnection,
} from './controller/checkControllerConnection.js';
import { profileTemplates } from './profileTemplates.js';

const server = express();
server.disable('x-powered-by');

server.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'mercury' });
});

server.get('/api/profile-templates', (_request, response) => {
  response.json(profileTemplates);
});

server.get('/api/controller/check', async (_request, response) => {
  const result = await checkControllerConnection();
  response.status(result.connected ? 200 : 503).json(result);
});

// After building, the browser and Electron use the same UI and API origin.
server.use(
  express.static(fileURLToPath(new URL('../../web/dist/', import.meta.url))),
);

server.use((_request, response) => {
  response.status(404).json({ error: 'Not found' });
});

server.listen(3001, '127.0.0.1', () => {
  console.log('Mercury API: http://127.0.0.1:3001');
  void initializeControllerConnection().then((result) => {
    if (result.connected) {
      console.log(
        `Controller initialized on ${result.port} (ITMP ${result.protocolVersion})`,
      );
    } else {
      console.warn(`Controller initialization failed: ${result.error}`);
    }
  });
});
