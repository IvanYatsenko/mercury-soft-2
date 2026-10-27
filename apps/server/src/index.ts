import { createSettingsAccessRouter } from './settingsAccess.js';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import express from 'express';
import { config } from './config.js';
import { startUsbLogger } from './usbLogger.js';
import {
  checkSoftwareUpdate,
  downloadSoftwareUpdate,
  installSoftwareUpdate,
  updateBusy,
  updateStatus,
} from './softwareUpdate.js';
import { profileRunner } from './profileRunner.js';
import {
  listProfiles,
  saveProfile,
  deleteProfile,
  findProfile,
  importProfiles,
  listStoredRuns,
  storedRunDetails,
  getMetadata,
  setMetadata,
  checkpointDatabase,
} from './database.js';
import { startRaspberryCooling } from './raspberryCooling.js';
import {
  handleRaspberryShutdown,
  isShuttingDown,
} from './raspberryShutdown.js';
import {
  checkControllerConnection,
  getVirtualBoardSnapshot,
  initializeControllerConnection,
  listTestElements,
  powerOffController,
  testOvenElement,
  setConvectionEnabled,
  advanceIdleSimulation,
  playBoardStartupSound,
  setDoorWarning,
} from './controller/checkControllerConnection.js';
import { profileTemplates } from './profileTemplates.js';
import {
  isOvenSelection,
  listOvenModels,
  readOvenSelection,
  saveOvenSelection,
  readFanReferenceHz,
  saveFanReferenceHz,
  readFanWarningsEnabled,
  saveFanWarningsEnabled,
  readSoundOnErrors,
  saveCombinedRoles,
  readThermalProtection,
  readProtectionLimits,
  saveThermalProtection,
  saveSoundOnErrors,
  flushConfigWrites,
  readThermalSettings,
  saveThermalSettings,
  readKeepHeatEnabled,
  saveKeepHeatEnabled,
} from './ovenSettings.js';
import {
  connectWifi,
  disconnectWifi,
  getWifiStatus,
  listWifiNetworks,
  setWifiEnabled,
} from './wifi.js';

startUsbLogger();
const server = express();
let terminating = false;
server.disable('x-powered-by');
server.use(express.json());
server.use((_request, response, next) => {
  if (isShuttingDown() || terminating) {
    response.status(503).json({ error: 'Печь выключается.' });
    return;
  }
  next();
});

server.use(
  createSettingsAccessRouter(undefined, () => profileRunner.snapshot().id),
);

server.use((request, response, next) => {
  if (
    updateBusy() &&
    request.method !== 'GET' &&
    !request.path.startsWith('/api/software-update')
  ) {
    response.status(409).json({ error: 'Выполняется обновление программы.' });
    return;
  }
  if (
    profileRunner.controlling() &&
    !['/api/settings/keep-heat', '/api/settings/sound-on-errors'].includes(
      request.path,
    ) &&
    request.method !== 'GET' &&
    (request.path.startsWith('/api/controller/') ||
      request.path.startsWith('/api/settings/') ||
      request.path === '/api/config')
  ) {
    response.status(409).json({
      error: 'Останови профиль перед изменением настроек оборудования.',
    });
    return;
  }
  next();
});

const profilesResponse = () => ({
  profiles: listProfiles(),
  selectedId: getMetadata('selected-profile') ?? null,
});
server.get('/api/software-update', (_request, response) =>
  response.json(updateStatus()),
);
server.post('/api/software-update/:action', async (request, response) => {
  try {
    if (profileRunner.controlling())
      throw new Error('Останови профиль и поддержание перед обновлением.');
    const action = request.params.action;
    if (action === 'check') response.json(await checkSoftwareUpdate());
    else if (action === 'download')
      response.json(await downloadSoftwareUpdate());
    else if (action === 'install') {
      const board = await checkControllerConnection();
      if (
        !board.ready ||
        !board.telemetry ||
        board.telemetry.lamps !== false ||
        board.telemetry.heaters !== false ||
        Math.max(
          board.telemetry.chamberTemperatureC ?? Infinity,
          board.telemetry.boardTemperatureC ?? Infinity,
        ) >= 50
      )
        throw new Error(
          'Перед установкой выключи нагрев и дождись температуры ниже 50 °C.',
        );
      response.json(await installSoftwareUpdate());
    } else response.status(404).json({ error: 'Неизвестное действие.' });
  } catch (error) {
    response.status(400).json({ error: String(error) });
  }
});
server.get('/api/settings/thermal', (_request, response) => {
  response.json(readThermalSettings());
});
server.get('/api/settings/keep-heat', (_request, response) =>
  response.json({ enabled: readKeepHeatEnabled() }),
);
server.put('/api/settings/keep-heat', async (request, response) => {
  try {
    const enabled = await saveKeepHeatEnabled(request.body?.enabled);
    if (!enabled) await profileRunner.disableKeepHeat();
    else if (
      !profileRunner.controlling() &&
      !profileRunner.snapshot().pendingReady
    )
      await profileRunner.startTemperatureHold();
    response.json({ enabled });
  } catch (error) {
    response.status(400).json({ error: String(error) });
  }
});
server.put('/api/settings/thermal', async (request, response) => {
  try {
    response.json(await saveThermalSettings(request.body));
  } catch (error) {
    response.status(400).json({ error: String(error) });
  }
});
server.get('/api/profiles', (_request, response) =>
  response.json(profilesResponse()),
);
server.post('/api/profiles/import', (request, response) => {
  try {
    importProfiles(request.body?.profiles);
    response.json(profilesResponse());
  } catch (error) {
    response.status(400).json({ error: String(error) });
  }
});
server.post('/api/profiles', (request, response) => {
  try {
    response.status(201).json(saveProfile(request.body));
  } catch (error) {
    response.status(400).json({ error: String(error) });
  }
});
server.put('/api/profiles/selected', (request, response) => {
  try {
    const profile = findProfile(String(request.body?.id));
    setMetadata('selected-profile', profile.id!);
    response.json({ selectedId: profile.id });
  } catch (error) {
    response.status(400).json({ error: String(error) });
  }
});
server.put('/api/profiles/:id', (request, response) => {
  try {
    response.json(saveProfile(request.body, String(request.params.id)));
  } catch (error) {
    response.status(400).json({ error: String(error) });
  }
});
server.delete('/api/profiles/:id', (request, response) => {
  try {
    if (profileRunner.active())
      throw new Error('Останови профиль перед удалением.');
    deleteProfile(String(request.params.id));
    response.status(204).end();
  } catch (error) {
    response.status(400).json({ error: String(error) });
  }
});
server.get('/api/run', (_request, response) =>
  response.json(profileRunner.snapshot()),
);
server.post('/api/run/start', async (request, response) => {
  try {
    response.json(
      await profileRunner.startProfile(
        findProfile(String(request.body?.profileId)),
      ),
    );
  } catch (error) {
    response.status(409).json({ error: String(error) });
  }
});
server.post('/api/run/stop', async (_request, response) => {
  response.json(await profileRunner.stop());
});
server.post('/api/run/hold', async (_request, response) => {
  try {
    response.json(await profileRunner.startTemperatureHold());
  } catch (error) {
    response.status(409).json({ error: String(error) });
  }
});
for (const action of ['pause', 'resume'] as const) {
  server.post(`/api/run/${action}`, async (_request, response) => {
    try {
      response.json(await profileRunner[action]());
    } catch (error) {
      response.status(409).json({ error: String(error) });
    }
  });
}
server.post('/api/run/ready', async (request, response) => {
  try {
    response.json(await profileRunner.acknowledgeReady(request.body?.runId));
  } catch (error) {
    response.status(409).json({ error: String(error) });
  }
});
server.post('/api/run/maximum-response-test', async (request, response) => {
  try {
    response.json(
      await profileRunner.startMaximumResponseTest(
        request.body?.targetTemperatureC ?? 100,
      ),
    );
  } catch (error) {
    response.status(409).json({ error: String(error) });
  }
});
server.get('/api/history', async (_request, response) =>
  response.json(await listStoredRuns()),
);
server.get('/api/history/:id', async (request, response) => {
  try {
    response.json(await storedRunDetails(String(request.params.id)));
  } catch (error) {
    response.status(404).json({ error: String(error) });
  }
});

server.get('/api/health', (_request, response) => {
  response.json({ status: 'ok', service: 'mercury' });
});

server.get('/api/network', (_request, response) => {
  const addresses = [
    ...new Set(
      Object.values(networkInterfaces()).flatMap((entries) =>
        (entries ?? [])
          .filter(
            (entry) =>
              !entry.internal &&
              entry.family === 'IPv4' &&
              !entry.address.startsWith('169.254.'),
          )
          .map((entry) => entry.address),
      ),
    ),
  ];
  response.json({ addresses });
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
    const selected = await saveOvenSelection(request.body);
    response.json({ selected, models: listOvenModels() });
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
  response.status(result.connected ? 200 : 503).json({
    ...result,
    fanReferenceHz: readFanReferenceHz(),
    reactToFanErrors: readFanWarningsEnabled(),
    soundOnErrors: readSoundOnErrors(),
    thermalProtection: readThermalProtection(),
    protectionLimits: readProtectionLimits(),
  });
});

server.put('/api/settings/combined-roles', async (request, response) => {
  try {
    response.json({ enabled: await saveCombinedRoles(request.body?.enabled) });
  } catch (error) {
    response.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : 'Не удалось сохранить объединение ролей.',
    });
  }
});

server.put('/api/settings/fan-warnings', async (request, response) => {
  try {
    response.json({
      enabled: await saveFanWarningsEnabled(request.body?.enabled),
    });
  } catch (error) {
    response.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : 'Не удалось сохранить предупреждения.',
    });
  }
});

server.put('/api/settings/sound-on-errors', async (request, response) => {
  try {
    response.json({ enabled: await saveSoundOnErrors(request.body?.enabled) });
  } catch (error) {
    response.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : 'Не удалось сохранить звуковые сигналы.',
    });
  }
});

server.put('/api/settings/thermal-protection', async (request, response) => {
  try {
    response.json({
      enabled: await saveThermalProtection(request.body?.enabled),
      limits: readProtectionLimits(),
    });
  } catch (error) {
    response.status(400).json({
      error:
        error instanceof Error
          ? error.message
          : 'Не удалось сохранить термозащиту.',
    });
  }
});

server.put('/api/settings/fan-reference', async (request, response) => {
  try {
    const fanReferenceHz = await saveFanReferenceHz(
      request.body?.fanReferenceHz,
    );
    response.json({ fanReferenceHz });
  } catch (error) {
    response.status(400).json({
      error:
        error instanceof Error ? error.message : 'Не удалось сохранить эталон.',
    });
  }
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

const httpServer = server.listen(port, config.apiHost, () => {
  void startRaspberryCooling().catch((error: unknown) => {
    console.warn('Raspberry cooling initialization failed:', error);
  });
  console.log(`Mercury API: http://${config.apiHost}:${port}`);
  if (config.controllerMode === 'simulation') {
    console.log('Controller simulation enabled (state: STARTING)');
  }

  let previousStatus = '';
  let startupSoundPlayed = false;
  const monitorController = async () => {
    if (isShuttingDown()) return;
    if (!profileRunner.controlling()) advanceIdleSimulation(2);
    try {
      const result = await initializeControllerConnection();
      setDoorWarning(
        profileRunner.active() &&
          result.connected &&
          result.ready === true &&
          result.doorOpen === true,
      );
      if (!result.connected || !result.ready) startupSoundPlayed = false;
      if (
        result.connected &&
        result.ready &&
        !startupSoundPlayed &&
        !profileRunner.active()
      ) {
        startupSoundPlayed = true;
        try {
          await playBoardStartupSound();
        } catch (error) {
          console.warn('Стартовый сигнал пищалки:', String(error));
        }
      }
      if (
        profileRunner.controlling() &&
        (!result.connected ||
          !result.ready ||
          (result.state ?? 0) & (2 | 4 | 8 | 32 | 64 | 128))
      ) {
        await profileRunner.failFromMonitor(
          result.error ??
            `Ошибка или отключение платы (${result.state ?? 'нет состояния'}).`,
        );
      }
      if (
        result.connected &&
        result.ready &&
        !profileRunner.active() &&
        profileRunner.needsOutputReset
      ) {
        await profileRunner.resetIdleOutputs(
          Math.max(
            result.telemetry?.chamberTemperatureC ?? Infinity,
            result.telemetry?.boardTemperatureC ?? Infinity,
          ),
        );
      }
      if (result.connected && result.ready)
        await profileRunner.updateIdleCooling(
          Math.max(
            result.telemetry?.chamberTemperatureC ?? Infinity,
            result.telemetry?.boardTemperatureC ?? Infinity,
          ),
        );
      if (result.connected) await handleRaspberryShutdown(result.state);
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
      await profileRunner.failFromMonitor(String(error));
    } finally {
      setTimeout(() => void monitorController(), 2000);
    }
  };
  void monitorController();
});

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    setDoorWarning(false);
    terminating = true;
    httpServer.close();
    void flushConfigWrites()
      .then(() => profileRunner.stop())
      .then(async () => {
        await checkpointDatabase();
        process.exit(0);
      })
      .catch((error: unknown) => {
        console.error('Failed to stop run:', error);
        process.exit(1);
      });
  });
