import {
  powerOffController,
  closeControllerConnection,
} from './controller/checkControllerConnection.js';
import { config } from './config.js';

// One-shot helper. It never starts the API, initializes the board, or starts fans.
try {
  if (config.controllerMode !== 'hardware')
    throw new Error('Board power cut requires hardware mode');
  const result = await powerOffController(config.serialPort, 5);
  if (!result.success)
    throw new Error(result.error ?? 'Board did not acknowledge poweroff');
  console.log('Application stopped; board poweroff [5] sent');
} catch (error) {
  console.error('Board poweroff failed:', error);
  process.exitCode = 1;
} finally {
  closeControllerConnection();
}
process.exit(process.exitCode ?? 0);
