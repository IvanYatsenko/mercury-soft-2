import { app, BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import isDev from 'electron-is-dev'
import OvenManager from './Entities/Oven/OvenManager'
import SoundManager from './SoundManager/SoundManager'
import { TimeController } from './Entities/TimeController/TimeController'
import OvenStore from './Store/ovenStore'
import ProfilesStore from './Store/profilesStore'
import { RestOven } from './Entities/Rest/RestOven.js'

// import { MonitoringApi } from './Entities/MonitoringApi/MonitoringApi'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null

const BUILD_OPTIONS = {
  icon: path.join(process.env.VITE_PUBLIC, 'mercury.ico'),
  webPreferences: {
    preload: path.join(__dirname, 'preload.mjs')
  },
  titleBarStyle: 'hidden',
  fullscreen: true
}

const DEV_OPTIONS = {
  icon: path.join(process.env.VITE_PUBLIC, 'mercury.ico'),
  webPreferences: {
    preload: path.join(__dirname, 'preload.mjs')
  }
}

app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
app.commandLine.appendSwitch('disable-http-cache')
app.commandLine.appendSwitch('disable-application-cache')
app.commandLine.appendSwitch('media-cache-size', '1')
app.commandLine.appendSwitch('disk-cache-size', '1')

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('ready', () => {
  const timeController = new TimeController()
  const ovenManager = new OvenManager()
  ovenManager.init().then(() => {
    const ovenStore = new OvenStore(ovenManager, new SoundManager(), timeController)
    ovenStore.profilesStore = new ProfilesStore()
    // MonitoringApi()

    win = new BrowserWindow(isDev ? DEV_OPTIONS : BUILD_OPTIONS)

    win.setTitle('Mercury v2')

    win.webContents.on('did-finish-load', () => {
      win?.webContents.send('main-process-message', new Date().toLocaleString())
    })

    if (VITE_DEV_SERVER_URL) {
      win.loadURL(VITE_DEV_SERVER_URL)
    } else {
      win.loadFile(path.join(RENDERER_DIST, 'index.html'))
    }

    new RestOven(ovenStore, RENDERER_DIST, win.webContents)
  })
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    win = new BrowserWindow(isDev ? DEV_OPTIONS : BUILD_OPTIONS)

    win.setTitle('Mercury v2')

    win.webContents.on('did-finish-load', () => {
      win?.webContents.send('main-process-message', new Date().toLocaleString())
    })

    if (VITE_DEV_SERVER_URL) {
      win.loadURL(VITE_DEV_SERVER_URL)
    } else {
      win.loadFile(path.join(RENDERER_DIST, 'index.html'))
    }
  }
})
