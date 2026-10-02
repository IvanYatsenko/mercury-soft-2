import { app, BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

const envFile = new URL('../../../.env', import.meta.url);
if (existsSync(envFile)) loadEnvFile(envFile);

const fullscreen = process.env.MERCURY_PANEL_FULLSCREEN === 'true';
if (process.env.MERCURY_PANEL_SOFTWARE_RENDERING === 'true') {
  app.disableHardwareAcceleration();
}

const appUrl = process.argv.includes('--dev')
  ? `http://127.0.0.1:${process.env.MERCURY_WEB_PORT ?? 5173}`
  : `http://127.0.0.1:${process.env.MERCURY_API_PORT ?? 3001}`;

async function createWindow() {
  const window = new BrowserWindow({
    title: 'Mercury — экран печи',
    width: fullscreen ? 480 : 800,
    height: fullscreen ? 320 : 600,
    fullscreen,
    frame: !fullscreen,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== appUrl) event.preventDefault();
  });
  window.once('ready-to-show', () => window.show());
  await window.loadURL(appUrl);
}

function openWindow() {
  void createWindow().catch((error: unknown) => {
    console.error('Failed to open Mercury:', error);
    app.exit(1);
  });
}

void app.whenReady().then(() => {
  openWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
