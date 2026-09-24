import { fileURLToPath } from 'node:url';
import express from 'express';

const server = express();
server.disable('x-powered-by');

server.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'mercury' });
});

// After building, the browser and Electron use the same UI and API origin.
server.use(
  express.static(fileURLToPath(new URL('../../web/dist/', import.meta.url))),
);

server.use((_request, response) => {
  response.status(404).json({ error: 'Not found' });
});

server.listen(3001, '127.0.0.1', () => {
  console.log('Mercury API: http://127.0.0.1:3001/api/health');
});
