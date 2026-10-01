import { createRequire } from 'node:module';

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
  boardType?: '230V' | '380V' | 'unknown';
  readData?: unknown;
  error?: string;
};

type ControllerSession = {
  port: string;
  client: ItmpClient;
  protocolVersion?: 0 | 1 | 2;
  boardType?: ControllerConnectionCheck['boardType'];
};

let session: ControllerSession | undefined;
let activeCheck: Promise<ControllerConnectionCheck> | undefined;

/** Initializes and checks the controller over the persistent serial connection. */
export async function initializeControllerConnection(
  port = process.env.MERCURY_SERIAL_PORT ?? 'COM4',
): Promise<ControllerConnectionCheck> {
  if (activeCheck) return activeCheck;

  activeCheck = performConnectionCheck(port);
  try {
    return await activeCheck;
  } finally {
    activeCheck = undefined;
  }
}

export const checkControllerConnection = initializeControllerConnection;

async function performConnectionCheck(
  port: string,
): Promise<ControllerConnectionCheck> {
  if (session && session.port !== port) {
    return {
      connected: false,
      port,
      error: `Сервер уже использует ${session.port}. Перезапусти сервер для смены порта.`,
    };
  }

  if (!session) {
    try {
      const url = `itmp.serial://${port}?baudRate=115200&dataBits=8&stopBits=1&parity=none~2`;
      const client = itmp.connect(url);

      if (!client) {
        return {
          connected: false,
          port,
          error: 'Не удалось создать ITMP-подключение.',
        };
      }

      session = { port, client };
    } catch (error) {
      return { connected: false, port, error: getErrorMessage(error) };
    }
  }

  return readController(session);
}

async function readController(
  activeSession: ControllerSession,
): Promise<ControllerConnectionCheck> {
  const { port, client } = activeSession;

  let readData: unknown;
  let lastError: unknown;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      readData = await client.call('get', [], undefined, 1200);
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError !== undefined) {
    return {
      connected: false,
      port,
      error: getErrorMessage(lastError),
    };
  }

  try {
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
      activeSession.boardType = boardDescription.includes('120')
        ? '230V'
        : description !== ''
          ? '380V'
          : 'unknown';
    }

    const protocolVersion = activeSession.protocolVersion ?? 0;
    const boardType = activeSession.boardType ?? 'unknown';

    return {
      connected: true,
      port,
      protocolVersion,
      boardType,
      readData,
    };
  } catch (error) {
    return {
      connected: false,
      port,
      error: getErrorMessage(error),
    };
  }
}

export function closeControllerConnection(): void {
  session?.client.close();
  session = undefined;
}

process.once('exit', closeControllerConnection);

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Контроллер не ответил.';
}
