import { createRequire } from 'node:module';
import { config } from '../config.js';
import { getOvenModel, readOvenSelection } from '../ovenSettings.js';
import { virtualBoard } from './virtualBoard.js';

const require = createRequire(import.meta.url);

type ItmpClient = {
  call: (
    name: string,
    args: unknown[],
    options?: unknown,
    timeout?: number,
  ) => Promise<unknown>;
  describe: (topic: string, timeout?: number) => Promise<unknown>;
  close: () => void;
};

type ItmpModule = {
  connect: (url: string) => ItmpClient | undefined;
};

const itmp = require('itmp') as ItmpModule;

export type ControllerConnectionCheck = {
  connected: boolean;
  port: string;
  protocolVersion?: 0 | 1 | 2;
  boardType?: '220V' | '230V' | '380V' | 'unknown';
  ready?: boolean;
  state?: number;
  readData?: unknown;
  telemetry?: OvenTelemetry;
  simulated?: boolean;
  error?: string;
};

type OvenTelemetry = {
  chamberTemperatureC: number | null;
  boardTemperatureC: number | null;
  convectionFanHz: number | null;
  lamps: boolean | null;
  heaters: boolean | null;
  fans: boolean | null;
  convection: boolean | null;
};

function decodeTelemetry(
  readData: unknown,
  hv: unknown,
  protocolVersion: number,
  boardType: ControllerConnectionCheck['boardType'],
): OvenTelemetry {
  const selection = readOvenSelection();
  const model = selection && getOvenModel(selection.ovenModel);
  const outputs =
    boardType === '380V'
      ? model?.outputs.threePhase
      : model?.outputs.singlePhase;
  const data = Array.isArray(readData) ? readData : [];
  const heaters = Array.isArray(hv) ? hv : [];
  const temperature = (index: number): number | null => {
    const value = data[index];
    if (!Number.isFinite(value)) return null;
    return protocolVersion >= 2
      ? Math.round(value / 4)
      : Math.round(
          24.5809 * (((data[0] / 32) * 0.039986) ** 1.01 + value / 128),
        );
  };
  const active = (names: string[]): boolean | null => {
    if (!outputs || !Array.isArray(hv)) return null;
    return names.some((name) => {
      const index = outputs[name];
      return index !== undefined && Number(heaters[index]) !== 0;
    });
  };
  return {
    chamberTemperatureC: temperature(
      model?.sensors.chamberTemperature.index ?? 2,
    ),
    boardTemperatureC: temperature(model?.sensors.boardTemperature.index ?? 1),
    convectionFanHz: Number.isFinite(data[3]) ? data[3] : null,
    lamps: active(['infrared', 'infrared2']),
    heaters: active(['topHeater', 'bottomHeater']),
    fans: active(['f1', 'f2']),
    convection: active(['convection']),
  };
}

type ControllerSession = {
  port: string;
  client: ItmpClient;
  protocolVersion?: 0 | 1 | 2;
  boardType?: ControllerConnectionCheck['boardType'];
  ready?: boolean;
};

const WORKING = 1;
const STARTING = 256;
const NO_COMMAND_TIMEOUT = 2;
const ELEMENT_TEST_DURATION_MS = 3000;
const testElementLabels = {
  topHeater: 'Верхний нагреватель',
  bottomHeater: 'Нижний нагреватель',
  convection: 'Конвекционный вентилятор',
  infrared: 'Инфракрасная лампа 1',
  infrared2: 'Инфракрасная лампа 2',
  infrared3: 'Инфракрасная лампа 3',
  f1: 'Вентилятор охлаждения 1',
  f2: 'Вентилятор охлаждения 2',
} as const;

export function listTestElements() {
  const selection = readOvenSelection();
  const model = selection && getOvenModel(selection.ovenModel);
  if (!model) return [];
  const parallelFans = hasParallelCoolingFans(model.model, session?.boardType);
  return Object.entries(testElementLabels)
    .filter(
      ([name]) =>
        name in model.outputs.singlePhase && !(parallelFans && name === 'f2'),
    )
    .map(([name, label]) => ({
      name,
      label: parallelFans && name === 'f1' ? 'Вентиляторы охлаждения' : label,
    }));
}

function hasParallelCoolingFans(
  model: string,
  boardType: ControllerConnectionCheck['boardType'],
) {
  return (
    model === '300' &&
    (isSimulationMode() || boardType === '230V' || boardType === '380V')
  );
}

let session: ControllerSession | undefined;
let activeCheck: Promise<ControllerConnectionCheck> | undefined;
let activeOperation: Promise<unknown> | undefined;
let convectionEnabled = true;

async function applyConvection(
  hv: unknown,
  boardType: ControllerConnectionCheck['boardType'],
  enabled: boolean,
  call: (values: number[]) => unknown | Promise<unknown>,
) {
  const selection = readOvenSelection();
  const model = selection && getOvenModel(selection.ovenModel);
  const outputs =
    boardType === '380V'
      ? model?.outputs.threePhase
      : model?.outputs.singlePhase;
  const index = outputs?.convection;
  if (index === undefined || !Array.isArray(hv) || hv.length !== 8)
    throw new Error('Не удалось определить выход конвекционного вентилятора.');
  const values = hv.map(Number);
  if (Boolean(values[index]) !== enabled) {
    values[index] = enabled ? 1 : 0;
    await call(values);
  }
  return values;
}

export async function setConvectionEnabled(
  enabled: boolean,
): Promise<ControllerConnectionCheck> {
  return runExclusive(async () => {
    if (isSimulationMode()) {
      const status = simulatedCheck();
      if (!status.ready) throw new Error('Плата не готова.');
      await applyConvection(
        virtualBoard.call('setHV'),
        'unknown',
        enabled,
        (values) => virtualBoard.call('setHV', values),
      );
      convectionEnabled = enabled;
      return simulatedCheck();
    }
    const activeSession = getOrCreateSession(config.serialPort);
    if (!activeSession) throw new Error('Нет связи с платой.');
    const status = await readController(activeSession);
    if (!status.connected || !status.ready)
      throw new Error(status.error ?? 'Плата не готова.');
    await applyConvection(
      await activeSession.client.call('setHV', [], undefined, 1200),
      status.boardType,
      enabled,
      (values) => activeSession.client.call('setHV', values, undefined, 1200),
    );
    convectionEnabled = enabled;
    return readController(activeSession);
  });
}

/** Initializes and checks the controller over the persistent serial connection. */
export async function initializeControllerConnection(
  port = config.serialPort,
): Promise<ControllerConnectionCheck> {
  if (isSimulationMode()) {
    return runExclusive(async () => {
      try {
        virtualBoard.call('stat', [2]);
      } catch {
        virtualBoard.reset();
        virtualBoard.call('stat', [2]);
      }
      if (readOvenSelection())
        await applyConvection(
          virtualBoard.call('setHV'),
          'unknown',
          convectionEnabled,
          (values) => virtualBoard.call('setHV', values),
        );
      return simulatedCheck();
    });
  }

  return runExclusive(async () => {
    let activeSession: ControllerSession | undefined;
    try {
      activeSession = getOrCreateSession(port);
    } catch (error) {
      return { connected: false, port, error: getErrorMessage(error) };
    }

    if (!activeSession) {
      return {
        connected: false,
        port,
        error: 'Не удалось создать ITMP-подключение.',
      };
    }

    return readController(activeSession, true);
  });
}

export async function checkControllerConnection(
  port = config.serialPort,
): Promise<ControllerConnectionCheck> {
  if (isSimulationMode()) return simulatedCheck();

  return runConnectionCheck(() => performConnectionCheck(port));
}

async function runConnectionCheck(
  check: () => Promise<ControllerConnectionCheck>,
): Promise<ControllerConnectionCheck> {
  if (activeCheck) return activeCheck;

  activeCheck = runExclusive(check);
  try {
    return await activeCheck;
  } finally {
    activeCheck = undefined;
  }
}

async function runExclusive<T>(operation: () => Promise<T>): Promise<T> {
  const previous = activeOperation?.catch(() => undefined) ?? Promise.resolve();
  const current = previous.then(operation);
  activeOperation = current;

  try {
    return await current;
  } finally {
    if (activeOperation === current) activeOperation = undefined;
  }
}

/** Pulses one configured output, preserving the running convection fan. */
export async function testOvenElement(name: unknown): Promise<{
  success: boolean;
  simulated: boolean;
  error?: string;
}> {
  if (typeof name !== 'string' || !Object.hasOwn(testElementLabels, name)) {
    return {
      success: false,
      simulated: isSimulationMode(),
      error: 'Этот элемент недоступен для выбранной печи.',
    };
  }

  return runExclusive(async () => {
    const simulated = isSimulationMode();
    let activeSession: ControllerSession | undefined;
    try {
      const selection = readOvenSelection();
      const model = selection && getOvenModel(selection.ovenModel);
      if (!model || !(name in model.outputs.singlePhase))
        throw new Error('Этот элемент недоступен для выбранной печи.');
      if (!simulated) activeSession = getOrCreateSession(config.serialPort);
      if (!simulated && !activeSession) throw new Error('Нет связи с платой.');

      const status = simulated
        ? simulatedCheck()
        : await readController(activeSession!);
      if (!status.connected || !status.ready)
        throw new Error('Плата не готова к проверке.');
      if (
        name === 'f2' &&
        hasParallelCoolingFans(model.model, status.boardType)
      )
        throw new Error(
          'На этой плате вентиляторы охлаждения проверяются вместе.',
        );
      if (!simulated && status.boardType === 'unknown') {
        throw new Error('Не удалось определить тип платы.');
      }

      const outputs =
        status.boardType === '380V'
          ? model.outputs.threePhase
          : model.outputs.singlePhase;
      const index = outputs[name];
      if (index === undefined || index === 0)
        throw new Error('Выход элемента не найден.');
      const call = (values: number[]) =>
        simulated
          ? virtualBoard.call('setHV', values)
          : activeSession!.client.call('setHV', values, undefined, 1200);
      const current = await call([]);
      const convectionIndex = outputs.convection;
      if (
        !Array.isArray(current) ||
        current.length !== 8 ||
        current.some(
          (value, outputIndex) =>
            outputIndex > 0 &&
            outputIndex !== convectionIndex &&
            Number(value) !== 0,
        )
      ) {
        throw new Error('Проверка недоступна: один из выходов уже включён.');
      }

      if (name === 'convection' && Number(current[index]) !== 0)
        throw new Error('Конвекционный вентилятор уже включён.');

      const values = current.map(Number);
      values[index] = 1;
      try {
        await call(values);
        await new Promise((resolve) =>
          setTimeout(resolve, ELEMENT_TEST_DURATION_MS),
        );
      } finally {
        await call(current.map(Number));
      }
      return { success: true, simulated };
    } catch (error) {
      return { success: false, simulated, error: getErrorMessage(error) };
    }
  });
}

/** Sends the controller-board poweroff command without shutting down the Raspberry Pi. */
export async function powerOffController(port = config.serialPort): Promise<{
  success: boolean;
  port: string;
  simulated?: boolean;
  error?: string;
}> {
  if (isSimulationMode()) {
    virtualBoard.call('poweroff', [5]);
    return { success: true, port: 'SIMULATOR', simulated: true };
  }

  return runExclusive(async () => {
    let activeSession: ControllerSession | undefined;
    try {
      activeSession = getOrCreateSession(port);
    } catch (error) {
      return { success: false, port, error: getErrorMessage(error) };
    }

    if (!activeSession) {
      return {
        success: false,
        port,
        error: `Не удалось открыть ITMP-подключение к ${port}.`,
      };
    }

    try {
      await activeSession.client.call('poweroff', [5], undefined, 1200);
      activeSession.ready = false;
      return { success: true, port };
    } catch (error) {
      return { success: false, port, error: getErrorMessage(error) };
    }
  });
}

async function performConnectionCheck(
  port: string,
): Promise<ControllerConnectionCheck> {
  let activeSession: ControllerSession | undefined;
  try {
    activeSession = getOrCreateSession(port);
  } catch (error) {
    return { connected: false, port, error: getErrorMessage(error) };
  }

  if (!activeSession) {
    return {
      connected: false,
      port,
      error:
        'Не удалось создать ITMP-подключение. Проверь настройки последовательного порта.',
    };
  }

  return readController(activeSession);
}

function getOrCreateSession(port: string): ControllerSession | undefined {
  if (session && session.port !== port) {
    throw new Error(
      `Сервер уже использует ${session.port}. Перезапусти сервер для смены порта.`,
    );
  }

  if (!session) {
    const url = `itmp.serial://${port}?baudRate=115200&dataBits=8&stopBits=1&parity=none~2`;
    const client = itmp.connect(url);
    if (!client) return undefined;
    session = { port, client };
  }

  return session;
}

function isSimulationMode(): boolean {
  return config.controllerMode === 'simulation';
}

function simulatedCheck(): ControllerConnectionCheck {
  const snapshot = virtualBoard.snapshot();
  return {
    connected: snapshot.powered,
    port: 'SIMULATOR',
    protocolVersion: 2,
    boardType: 'unknown',
    ready: (snapshot.globalState & 1) !== 0,
    state: snapshot.globalState,
    ...(snapshot.powered
      ? {
          readData: virtualBoard.call('get') as number[],
          telemetry: decodeTelemetry(
            virtualBoard.call('get'),
            (snapshot.globalState & WORKING) !== 0
              ? virtualBoard.call('setHV')
              : [],
            2,
            'unknown',
          ),
        }
      : {}),
    simulated: true,
    ...(!snapshot.powered ? { error: 'Симулируемая плата выключена.' } : {}),
  };
}

export function getVirtualBoardSnapshot() {
  return virtualBoard.snapshot();
}

async function readController(
  activeSession: ControllerSession,
  initialize = false,
): Promise<ControllerConnectionCheck> {
  const { port, client } = activeSession;

  let readData: unknown;
  try {
    readData = await client.call('get', [], undefined, 1200);
  } catch (error) {
    activeSession.ready = false;
    // The serial link reconnects itself after a port close. Closing the ITMP
    // client here disables that retry and its cached port cannot be reopened.
    return {
      connected: false,
      port,
      error: getErrorMessage(error),
    };
  }

  try {
    let state = readState(await client.call('stat', [], undefined, 1200));
    if (
      initialize &&
      ((state & STARTING) !== 0 || (state & NO_COMMAND_TIMEOUT) !== 0)
    ) {
      state = readState(
        await client.call('stat', [NO_COMMAND_TIMEOUT], undefined, 1200),
      );
    }
    activeSession.ready = (state & WORKING) !== 0 && (state & STARTING) === 0;

    if (activeSession.protocolVersion === undefined) {
      let description: unknown = '';
      try {
        description = await client.describe('@', 1200);
      } catch {
        // Older controller firmware may not implement describe('@').
      }

      if (description !== '') {
        activeSession.protocolVersion = 2;
      } else {
        try {
          await client.call('gett', [], undefined, 1200);
          activeSession.protocolVersion = 1;
        } catch {
          activeSession.protocolVersion = 0;
        }
      }

      const boardDescription = String(description);
      activeSession.boardType =
        description === ''
          ? '220V'
          : boardDescription.includes('120')
            ? '230V'
            : '380V';
    }

    const protocolVersion = activeSession.protocolVersion ?? 0;
    const boardType = activeSession.boardType ?? 'unknown';

    let hv: unknown;
    try {
      if (activeSession.ready)
        hv = await client.call('setHV', [], undefined, 1200);
    } catch {
      // Temperature and connection state remain available if an output read fails.
    }
    if (initialize && activeSession.ready && readOvenSelection()) {
      hv = await applyConvection(hv, boardType, convectionEnabled, (values) =>
        client.call('setHV', values, undefined, 1200),
      );
    }

    return {
      connected: true,
      port,
      protocolVersion,
      boardType,
      ready: activeSession.ready ?? false,
      state,
      readData,
      telemetry: decodeTelemetry(readData, hv, protocolVersion, boardType),
    };
  } catch (error) {
    activeSession.ready = false;
    return {
      connected: false,
      port,
      readData,
      error: `Не удалось прочитать состояние платы: ${getErrorMessage(error)}`,
    };
  }
}

function readState(value: unknown): number {
  if (!Array.isArray(value) || !Number.isInteger(value[0])) {
    throw new Error('Команда stat вернула неверный ответ.');
  }
  return value[0] as number;
}

export function closeControllerConnection(): void {
  session?.client.close();
  session = undefined;
}

process.once('exit', closeControllerConnection);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Контроллер не ответил.';
}
