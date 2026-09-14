import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const os = require('node:os')
const express = require('express')
const cors = require('cors')

export class RestSocet {
  constructor(ovenStore, responseDIR, emmiter) {
    this.emitter = emmiter

    const ipAddress = Object.values(os.networkInterfaces())
      .flat()
      .find((iface) => iface.family === 'IPv4' && !iface.internal)?.address

    const app = express()

    if (typeof ipAddress === 'string') {
      app.use(cors())
      app.use(express.static(responseDIR))
      app.listen(8075, () => {
        console.log('Server start to: ' + ipAddress + ':8075')
      })
      ovenStore.ip = ipAddress
    }

    app.use(cors())
    const http = require('http').Server(app)
    const socketIO = require('socket.io')(http, {
      cors: {
        origin: `*`
      }
    })

    const PORT = 8085

    socketIO.on('connection', (socket) => {
      socket.on('load-ready-main-client', () => {
        socket.emit('connect-main-client', {
          profileData: JSON.stringify(ovenStore.profileData),
          profileName: ovenStore.profileName,
          buzyProfile: ovenStore.buzyProfile,
          listAP: ovenStore.listAP,
          statusAP: ovenStore.statusAP,
          version: ovenStore.version,
          errorFlag: ovenStore.errorFlag,
          warningFlag: ovenStore.warningFlag,
          stat: ovenStore.stat,
          coreTemp: ovenStore.coreTemp,
          timeHorizon: ovenStore.timeHorizon,
          isErrorFunModal: ovenStore.isErrorFunModal,
          state: ovenStore.state,
          progress: ovenStore.progress,
          indicators: ovenStore.indicators,
          temperature: ovenStore.temperature,
          extraTemperature: ovenStore.extraTemperature,
          error: ovenStore.error,
          sensors: ovenStore.sensors,
          heaters: ovenStore.heaters,
          errorOnFan: ovenStore.errorOnFan,
          i: ovenStore.i,
          errorStore: ovenStore.errorStore,
          soundOnErrors: ovenStore.soundOnErrors,
          thermalProtection: ovenStore.thermalProtection,
          thermocoupleCorrection: ovenStore.thermocoupleCorrection,
          fileService: ovenStore.fileService,
          monitorService: ovenStore.monitorService,
          convFreq: ovenStore.convFreq,
          fanTarget: ovenStore.fanTarget,
          criticalError: ovenStore.criticalError,
          heat: ovenStore.heat,
          heatIndicators: ovenStore.heatIndicators,
          mercuryType: ovenStore.mercuryType,
          repeat: ovenStore.repeat,
          ip: ovenStore.ip,
          isVisibleFunSpeed: ovenStore.isVisibleFunSpeed,
          convFreqSpeed: ovenStore.convFreqSpeed
        })
      })

      socket.on('startEvent', (data) => {
        ovenStore.startEvent(
          ovenStore.profilesStore.loadProfileFromFile(data.filepath)
        )
      })

      socket.on('keepHeat', () => {
        ovenStore.keepHeat(!ovenStore.heat)
      })

      socket.on('closeProgressPage', () => {
        ovenStore.closeProgressPage()
      })

      socket.on('switchErrorOnFan', () => {
        ovenStore.switchErrorOnFan()
      })

      socket.on('switchSoundOnErrors', () => {
        ovenStore.switchSoundOnErrors()
      })

      socket.on('switchVisibleSpeedFun', () => {
        ovenStore.switchVisibleSpeedFun()
      })

      socket.on('switchThermalProtection', () => {
        ovenStore.switchThermalProtection()
      })

      socket.on('switchThermocoupleCorrection', () => {
        ovenStore.switchThermocoupleCorrection()
      })

      socket.on('clearCriticalError', () => {
        ovenStore.clearCriticalError()
      })

      socket.on('clearErrorStore', () => {
        ovenStore.clearErrorStore()
      })

      socket.on('init-profiles', () => {
        socket.emit(
          'init-profiles-client',
          ovenStore.profilesStore.getProfiles()
        )
      })

      socket.on('updatePointsByShelves', (profileData) => {
        ovenStore.profilesStore.updatePointsByShelves(profileData)
      })

      socket.on('updateShelvesByPoints', (profileData) => {
        ovenStore.profilesStore.updateShelvesByPoints(profileData)
      })

      this.emitter.on('init-profiles-client--sync', () => {
        socket.emit(
          'init-profiles-client',
          ovenStore.profilesStore.getProfiles()
        )
      })

      socket.on('createProfile', (profileData) => {
        ovenStore.profilesStore.create(profileData, () => {
          this.emitter.emit('init-profiles-client--sync')
        })
      })

      socket.on('removeProfile', (filepath) => {
        ovenStore.profilesStore.remove(filepath, () => {
          this.emitter.emit('init-profiles-client--sync')
        })
      })

      socket.on('updateProfile', (profileData, profilePath) => {
        ovenStore.profilesStore.update(profileData, profilePath, () => {
          this.emitter.emit('init-profiles-client--sync')
        })
      })

      socket.on('onIdle', () => {
        ovenStore.onIdle()
      })

      socket.on('funOnPi', () => {
        ovenStore.funOnPi()
      })

      socket.on('funOffPi', () => {
        ovenStore.funOffPi()
      })

      socket.on('setHeaterOnTest', (nextHeaters) => {
        ovenStore.setHeaterOnTest(nextHeaters)
      })

      socket.on('setIndicatorWithCancel', (key, value) => {
        ovenStore.setIndicatorWithCancel(key, value)
      })

      socket.on('setTesterMode', (value) => {
        ovenStore.ovenManager.setTesterMode(value)
      })

      socket.on('setFanTarget', (value) => {
        ovenStore.setFanTarget(value)
      })

      socket.on('onCloseErrorFunModal', (closeProgress) => {
        ovenStore.onCloseErrorFunModal(closeProgress)
      })

      socket.on('update-app', () => {
        ovenStore.updateApp()
      })

      socket.on('update-Wifi-Aps', () => {
        ovenStore.updateWifiAps()
      })

      socket.on('on-wifi-ap', () => {
        ovenStore.onWifiAp()
      })

      socket.on('off-wifi-ap', () => {
        ovenStore.offWifiAp()
      })

      socket.on('connect-Wifi-Ap', (args) => {
        ovenStore.connectWifiAp(args)
      })

      socket.on('disconnect-Wifi-Ap', (args) => {
        ovenStore.disconnectWifiAp(args)
      })
    })

    this.socketIO = socketIO

    http.listen(PORT, () => {
      console.log('WebSocket start to PORT: ', PORT)
    })
  }
}
