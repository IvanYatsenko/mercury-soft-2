/**
 * Точка сборки HTTP API, управления платой и фоновых служб. Порядок проверок доступа и выключения значим.
 */
import { createActiveNotificationsRouter } from './activeNotifications.js';
import {
  ovenModelName,
  ovenModelNumber,
  supportsConnection,
} from '@mercury/shared';
import { detectedBoardType } from './controller/boardIdentity.js';
import { onOvenEvent, emitOvenEvent } from './ovenEvents.js';
import { startOptionalHttps } from './httpsServer.js';
import {
  flushElementRuntime,
  readElementRuntime,
  initializeRuntimeBackup,
  resetElementRuntime,
} from './elementRuntime.js';
import {
  createProfileOperationsRouter,
  profileAssessment,
} from './profileOperations.js';
import {
  FleetDirectory,
  createFleetRouter,
  startFleetDiscovery,
  type DeviceInfo,
} from './fleet.js';
import { createSettingsAccessRouter } from './settingsAccess.js';
import { createCalibrationRouter } from './calibration.js';
import { monitoringCommands } from './monitoringCommands.js';
import { advancedPin } from './operatorPin.js';
import {
  LegacyMonitoring,
  monitoringRouter,
  startLegacyMonitoring,
} from './legacyMonitoring.js';
import { allowDuringShutdown } from './pinRecovery.js';
import { createWebClientsRouter } from './webClients.js';
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
  updateBlocksRequest,
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
  clearStoredRuns,
  getMetadata,
  setMetadata,
  checkpointDatabase,
} from './database.js';
import {
  startRaspberryCooling,
  raspberryCoolingStatus,
  testRaspberryCooling,
} from './raspberryCooling.js';
import {
  handleRaspberryShutdown,
  isShuttingDown,
} from './raspberryShutdown.js';
import {
  checkControllerConnection,
  getVirtualBoardSnapshot,
  initializeControllerConnection,
  listTestElements,
  controllerCoolingStatus,
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
  readOvenIdentity,
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
let resettingRuntime = false;
const legacyMonitoring = new LegacyMonitoring(
  () => profileRunner.monitoringSnapshot(),
  () => ({
    referenceHz: readFanReferenceHz(),
    fanWarnings: readFanWarningsEnabled(),
    coreTemperatureC: raspberryCoolingStatus().temperatureC,
    controllerTemperatureC: controllerCoolingStatus().temperatureC,
    version: updateStatus().currentVersion,
    raspberryFan: raspberryCoolingStatus().enabled,
    controllerFan: controllerCoolingStatus().enabled,
  }),
  Date.now,
  () => isShuttingDown() || terminating,
);
const stopMonitoringEvents = onOvenEvent((event) =>
  legacyMonitoring.event(event),
);
server.use(monitoringRouter(legacyMonitoring));
server.disable('x-powered-by');
server.set('trust proxy', 'loopback');

server.use(express.json());
server.use((request, response, next) => {
  if (
    resettingRuntime &&
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
  ) {
    response
      .status(409)
      .json({ error: 'Дождитесь сброса моточасов и истории.' });
    return;
  }
  next();
});
server.use((_request, response, next) => {
  if (!allowDuringShutdown(_request.path, isShuttingDown(), terminating)) {
    response.status(503).json({ error: 'Печь выключается.' });
    return;
  }
  next();
});

server.use((request, response, next) => {
  if (updateBlocksRequest(request.method, request.path)) {
    response.status(409).json({ error: 'Выполняется обновление программы.' });
    return;
  }
  next();
});

server.use(
  createSettingsAccessRouter(undefined, () => profileRunner.snapshot().id),
);

server.use((request, response, next) => {
  if (
    profileRunner.controlling() &&
    ![
      '/api/settings/keep-heat',
      '/api/settings/sound-on-errors',
      '/api/settings/oven-identity',
      '/api/settings/calibration/stop',
    ].includes(request.path) &&
    request.path !== '/api/settings/fleet' &&
    !request.path.startsWith('/api/settings/fleet/') &&
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

server.use(createCalibrationRouter(profileRunner));
server.use(createActiveNotificationsRouter());
const optionalPushRouter = express.Router();
server.use(optionalPushRouter);
if (process.env.MERCURY_PUBLIC_URL && process.env.MERCURY_PUSH_SUBJECT) {
  void import('./pushNotifications.js')
    .then(({ pushNotifications }) => {
      optionalPushRouter.use(pushNotifications.createRouter());
      onOvenEvent((event) => pushNotifications.notify(event));
    })
    .catch(() =>
      console.warn(
        'Web Push не активирован: проверьте зависимости и настройки.',
      ),
    );
}
server.get('/api/push/status', (_req, res) =>
  res.set('Cache-Control', 'no-store').json({
    enabled: false,
    reason:
      'Фоновые push-уведомления отложены. Используйте оповещения открытой панели.',
  }),
);

/**
 * Формирует библиотеку профилей вместе с текущим выбором для клиентского экрана.
 */
const profilesResponse = () => ({
  profiles: listProfiles(),
  selectedId: getMetadata('selected-profile') ?? null,
});
server.get('/api/software-update', (_request, response) =>
  response.set('Cache-Control', 'no-store').json(updateStatus()),
);
server.post('/api/software-update/:action', async (request, response) => {
  try {
    if (profileRunner.controlling())
      throw new Error('Останови профиль и поддержание перед обновлением.');
    const action = request.params.action;
    if (action === 'check') response.json(await checkSoftwareUpdate());
    else if (action === 'download')
      response.json(await downloadSoftwareUpdate(request.body));
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
/**
 * Возвращает описание выбранной конфигурации, имя и сетевые сведения текущей печи.
 */
const deviceInfo = async (): Promise<DeviceInfo> => {
  const board = await checkControllerConnection();
  const selection = readOvenSelection();
  const identity = readOvenIdentity();
  const run = profileRunner.snapshot();
  return {
    service: 'mercury-oven',
    apiVersion: 1,
    name:
      identity.name ||
      ovenModelName(
        selection?.ovenModel ?? '',
        board.boardType === 'unknown' || !board.boardType
          ? detectedBoardType()
          : board.boardType,
      ),
    description: identity.description,
    model: ovenModelNumber(
      selection?.ovenModel ?? '',
      board.boardType === 'unknown' || !board.boardType
        ? detectedBoardType()
        : board.boardType,
    ),
    connectionVoltage: selection?.connectionVoltage ?? '',
    version: updateStatus().currentVersion,
    controller: {
      connected: board.connected,
      ready: board.ready === true,
      temperature: board.telemetry?.chamberTemperatureC ?? null,
      boardTemperature: board.telemetry?.boardTemperatureC ?? null,
    },
    run: {
      state: run.state,
      profileName: run.profileName,
      remainingSeconds: run.remainingSeconds,
    },
  };
};
const fleetDirectory = new FleetDirectory(deviceInfo);
let stopFleet: (() => void) | undefined;
server.use(createFleetRouter(fleetDirectory, deviceInfo));
server.use(
  createProfileOperationsRouter(fleetDirectory, () =>
    profileRunner.controlling(),
  ),
);

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
    if (request.body?.reviewKey !== undefined) {
      const profile = findProfile(String(request.body.profileId));
      const assessment = profileAssessment([profile]);
      if (!assessment.valid || request.body.reviewKey !== assessment.reviewKey)
        throw new Error(
          'Профиль или конфигурация изменились. Повторите проверку перед запуском.',
        );
      if (assessment.hasWarnings && request.body.acceptWarnings !== true)
        throw new Error('Подтвердите предупреждения перед запуском.');
    }

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
  if (
    !isOvenSelection(request.body) ||
    !supportsConnection(detectedBoardType(), request.body.connectionVoltage)
  ) {
    response.status(400).json({
      error: 'Выбери серию печи и подключение 220 или 380 В.',
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

server.get('/api/settings/element-runtime', async (_request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.json(await readElementRuntime());
});
server.post(
  '/api/settings/element-runtime/reset',
  async (_request, response) => {
    if (profileRunner.controlling()) {
      response
        .status(409)
        .json({ error: 'Остановите профиль и поддержание перед сбросом.' });
      return;
    }
    resettingRuntime = true;
    try {
      await resetElementRuntime();
      try {
        await clearStoredRuns();
      } catch {
        throw new Error(
          'Моточасы сброшены, но историю запусков очистить не удалось. Проверьте USB и повторите сброс.',
        );
      }
      response.json(await readElementRuntime());
    } catch (e) {
      response.status(409).json({
        error: e instanceof Error ? e.message : 'Не удалось сбросить моточасы.',
      });
    } finally {
      resettingRuntime = false;
    }
  },
);

server.get('/api/controller/auxiliary-cooling', (_request, response) => {
  response.json({
    raspberry: raspberryCoolingStatus(),
    controller: controllerCoolingStatus(),
  });
});
server.post(
  '/api/controller/auxiliary-cooling/test',
  async (request, response) => {
    if (profileRunner.controlling() || isShuttingDown()) {
      response
        .status(409)
        .json({ error: 'Останови профиль перед проверкой вентиляторов.' });
      return;
    }
    try {
      const result =
        request.body?.name === 'raspberry'
          ? await testRaspberryCooling()
          : request.body?.name === 'controller'
            ? await testOvenElement('controllerCooling')
            : null;
      if (!result) {
        response.status(400).json({ error: 'Неизвестный вентилятор.' });
        return;
      }
      response.status(result.success ? 200 : 409).json(result);
    } catch (error) {
      response.status(409).json({
        error:
          error instanceof Error ? error.message : 'Проверка не выполнена.',
      });
    }
  },
);

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

// Both clients share the API, but Electron keeps its separately installed bundle.
server.use(
  createWebClientsRouter(
    fileURLToPath(new URL('../../web/dist/', import.meta.url)),
    fileURLToPath(new URL('../../web/pc-dist/', import.meta.url)),
  ),
);

server.use((_request, response) => {
  response.status(404).json({ error: 'Not found' });
});

const httpsServer = startOptionalHttps(server, config.apiHost, config.apiPort);
const port = config.apiPort;

const httpServer = server.listen(port, config.apiHost, async () => {
  await initializeRuntimeBackup();
  stopFleet = startFleetDiscovery(fleetDirectory, port);
  void startRaspberryCooling().catch((error: unknown) => {
    console.warn('Raspberry cooling initialization failed:', error);
  });
  console.log(`Mercury API: http://${config.apiHost}:${port}`);
  if (config.controllerMode === 'simulation') {
    console.log('Controller simulation enabled (state: STARTING)');
  }

  let previousStatus = '';
  let wasConnected = false;
  let previousFault = 0;
  let startupSoundPlayed = false;
  /**
   * Обновляет состояние связи и инициирует восстановление транспорта без автоматического продолжения завершённого профиля.
   */
  const monitorController = async () => {
    if (isShuttingDown()) return;
    if (!profileRunner.controlling()) advanceIdleSimulation(2);
    try {
      const result = await initializeControllerConnection();
      legacyMonitoring.observe(result);
      if (wasConnected && !result.connected)
        emitOvenEvent({
          kind: 'connectionLost',
          message: 'Raspberry потеряла связь с платой управления.',
        });
      wasConnected = result.connected;
      const fault = (result.state ?? 0) & (4 | 8 | 64 | 128);
      if (fault && fault !== previousFault && !profileRunner.controlling())
        emitOvenEvent({
          kind: 'error',
          message: `Критическая ошибка платы: ${result.state}`,
        });
      previousFault = fault;
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
const monitoringServer =
  config.monitoringEnabled && config.monitoringPort !== port
    ? startLegacyMonitoring(
        legacyMonitoring,
        config.apiHost,
        config.monitoringPort,
        monitoringCommands({
          pin: advancedPin,
          unavailable: () =>
            isShuttingDown() || terminating || updateBusy() || resettingRuntime,
          assess: profileAssessment,
          start: (profile) => profileRunner.startProfile(profile),
          stop: () => profileRunner.stop(),
        }),
      )
    : undefined;

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    stopFleet?.();
    stopMonitoringEvents();
    if (monitoringServer?.listening) monitoringServer.close();
    setDoorWarning(false);
    terminating = true;
    httpServer.close();
    httpsServer?.close();
    void flushConfigWrites()
      .then(() => profileRunner.stop())
      .then(async () => {
        await checkpointDatabase();
        await flushElementRuntime();
        process.exit(0);
      })
      .catch((error: unknown) => {
        console.error('Failed to stop run:', error);
        process.exit(1);
      });
  });
