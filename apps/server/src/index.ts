import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './config.js';
import {
  checkControllerConnection,
  getVirtualBoardSnapshot,
  initializeControllerConnection,
  listTestElements,
  powerOffController,
  testOvenElement,
  setConvectionEnabled,
} from './controller/checkControllerConnection.js';
import { profileTemplates } from './profileTemplates.js';
import {
  isOvenSelection,
  listOvenModels,
  readOvenSelection,
  saveOvenSelection,
} from './ovenSettings.js';
import {
  connectWifi,
  disconnectWifi,
  getWifiStatus,
  listWifiNetworks,
  setWifiEnabled,
} from './wifi.js';

const server = express();
server.disable('x-powered-by');
server.use(express.json());

server.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'mercury' });
});

server.get('/api/profile-templates', (_request, response) => {
  response.json(profileTemplates);
});

server.get('/api/wifi/status', async (_request, response) => {
  try {
    response.json(await getWifiStatus());
  } catch (error) {
    response.status(503).json({
      error:
        error instanceof Error
          ? error.message
          : 'Не удалось узнать состояние Wi-Fi.',
    });
  }
});

server.get('/api/wifi/networks', async (_request, response) => {
  try {
    response.json(await listWifiNetworks());
  } catch (error) {
    response.status(503).json({
      error:
        error instanceof Error ? error.message : 'Не удалось найти сети Wi-Fi.',
    });
  }
});

server.post('/api/wifi/connect', async (request, response) => {
  const { ssid, password } = request.body ?? {};
  if (
    typeof ssid !== 'string' ||
    !ssid.trim() ||
    Buffer.byteLength(ssid, 'utf8') > 32 ||
    (password !== undefined &&
      (typeof password !== 'string' || password.length > 128))
  ) {
    response
      .status(400)
      .json({ error: 'Укажи название сети (до 32 байт) и корректный пароль.' });
    return;
  }
  try {
    response.json(await connectWifi(ssid, password));
  } catch (error) {
    response.status(503).json({
      error:
        error instanceof Error
          ? error.message
          : 'Не удалось подключиться к Wi-Fi.',
    });
  }
});

server.post('/api/wifi/disconnect', async (_request, response) => {
  try {
    response.json(await disconnectWifi());
  } catch (error) {
    response.status(503).json({
      error:
        error instanceof Error
          ? error.message
          : 'Не удалось отключиться от Wi-Fi.',
    });
  }
});

server.post('/api/wifi/radio', async (request, response) => {
  if (typeof request.body?.enabled !== 'boolean') {
    response.status(400).json({ error: 'Укажи enabled: true или false.' });
    return;
  }
  try {
    response.json(await setWifiEnabled(request.body.enabled));
  } catch (error) {
    response.status(503).json({
      error:
        error instanceof Error
          ? error.message
          : 'Не удалось изменить состояние Wi-Fi.',
    });
  }
});

server.get('/api/config', (_request, response) => {
  try {
    response.json({ selected: readOvenSelection(), models: listOvenModels() });
  } catch (error) {
    response.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Не удалось прочитать config.json.',
    });
  }
});

server.put('/api/config', async (request, response) => {
  if (!isOvenSelection(request.body)) {
    response.status(400).json({
      error: 'Выбери модель печи и подключение 230 или 380 В.',
    });
    return;
  }
  try {
    response.json({ selected: await saveOvenSelection(request.body) });
  } catch (error) {
    response.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Не удалось сохранить config.json.',
    });
  }
});

server.get('/api/controller/check', async (_request, response) => {
  const result = await checkControllerConnection();
  response.status(result.connected ? 200 : 503).json(result);
});

server.get('/api/controller/test-elements', (_request, response) => {
  try {
    response.json({ elements: listTestElements(), durationMs: 3000 });
  } catch (error) {
    response.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Не удалось загрузить элементы печи.',
    });
  }
});

server.post('/api/controller/test-element', async (request, response) => {
  try {
    const result = await testOvenElement(request.body?.name);
    response.status(result.success ? 200 : 409).json(result);
  } catch (error) {
    response.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Не удалось проверить элемент.',
    });
  }
});

server.get('/api/controller/virtual-board', (_request, response) => {
  if (config.controllerMode !== 'simulation') {
    response.status(404).json({ error: 'Виртуальная плата выключена.' });
    return;
  }
  response.json({ simulated: true, ...getVirtualBoardSnapshot() });
});

server.post('/api/controller/initialize', async (_request, response) => {
  const result = await initializeControllerConnection();
  response.status(result.connected && result.ready ? 200 : 503).json(result);
});

server.post('/api/controller/poweroff', async (_request, response) => {
  const result = await powerOffController();
  response.status(result.success ? 200 : 503).json(result);
});

server.put('/api/controller/convection', async (request, response) => {
  if (typeof request.body?.enabled !== 'boolean') {
    response.status(400).json({ error: 'Укажи enabled: true или false.' });
    return;
  }
  try {
    response.json(await setConvectionEnabled(request.body.enabled));
  } catch (error) {
    response.status(503).json({
      error:
        error instanceof Error
          ? error.message
          : 'Не удалось переключить вентилятор.',
    });
  }
});

// After building, the browser and Electron use the same UI and API origin.
server.use(
  express.static(fileURLToPath(new URL('../../web/dist/', import.meta.url))),
);

server.use((_request, response) => {
  response.status(404).json({ error: 'Not found' });
});

const port = config.apiPort;

server.listen(port, '127.0.0.1', () => {
  console.log(`Mercury API: http://127.0.0.1:${port}`);
  if (config.controllerMode === 'simulation') {
    console.log('Controller simulation enabled (state: STARTING)');
  }

  let previousStatus = '';
  const monitorController = async () => {
    try {
      const result = await initializeControllerConnection();
      const status = result.connected
        ? `state=${result.state}, ready=${result.ready}`
        : (result.error ?? 'нет связи');
      if (status !== previousStatus) {
        const message = `Controller ${result.port}: ${status}`;
        if (result.connected) console.log(message);
        else console.warn(message);
        previousStatus = status;
      }
    } catch (error) {
      console.warn('Controller monitor failed:', error);
    } finally {
      setTimeout(() => void monitorController(), 2000);
    }
  };
  void monitorController();
});
