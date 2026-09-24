import { createServer } from 'node:http';

const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (request.method === 'GET' && request.url === '/api/health') {
    response.writeHead(200);
    response.end(JSON.stringify({ status: 'ok', service: 'mercury' }));
    return;
  }

  response.writeHead(404);
  response.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(3001, '127.0.0.1', () => {
  console.log('Mercury API: http://127.0.0.1:3001/api/health');
});
