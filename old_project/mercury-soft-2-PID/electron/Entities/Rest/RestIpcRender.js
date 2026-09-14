import { ipcMain } from 'electron'

export class RestIpcRender {
  constructor(ovenStore, emmiter, webContents) {
    this.emmiter = emmiter
    this.ipcMain = ipcMain
    this.ipcMain.on('load-ready-main-client', (event) => {
      event.reply('connect-main-client', {
        totalTime: ovenStore.totalTime,
        tableCorrect: ovenStore.tableCorrect,
        deviationProfileShelduleMax: ovenStore.deviationProfileShelduleMax,
        deviationProfileSheldule: ovenStore.deviationProfileSheldule,
        deviationsPoints: ovenStore.deviationsPoints,
        debugMode: ovenStore.debugMode,
        moveFile: ovenStore.moveFile,
        removeFile: ovenStore.removeFile,
        unzipFile: ovenStore.unzipFile,
        chmodeFile: ovenStore.chmodeFile,
        readyToUpdate: ovenStore.readyToUpdate,
        _checkFlagMD5: ovenStore._checkFlagMD5,
        errorDownloadFile: ovenStore.errorDownloadFile,
        downloadFlag: ovenStore.downloadFlag,
        versionToUpdate: ovenStore.versionToUpdate,
        updateFlag: ovenStore.updateFlag,
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
        convFreqSpeed: ovenStore.convFreqSpeed,
      })
    })

    this.ipcMain.on('setRepeate', (_event, data) => {
      ovenStore.setRepeate(data)
    })

    this.ipcMain.on('startEvent', (_event, data) => {
      ovenStore.startEvent(
        ovenStore.profilesStore.loadProfileFromFile(data.filepath),
      )
    })

    this.ipcMain.on('offFinishSound', () => {
      ovenStore.offFinishSound()
    })

    this.ipcMain.on('switchDebugMode', () => {
      ovenStore.switchDebugMode()
    })

    this.ipcMain.on('switchMercuryType', () => {
      ovenStore.switchMercuryType()
    })

    this.ipcMain.on('keepHeat', () => {
      ovenStore.keepHeat(!ovenStore.heat)
    })

    this.ipcMain.on('startToCalibrate', (_event, temp) => {
      ovenStore.startToCalibrate(temp)
    })

    this.ipcMain.on('closeProgressPage', () => {
      ovenStore.closeProgressPage()
    })

    this.ipcMain.on('switchErrorOnFan', () => {
      ovenStore.switchErrorOnFan()
    })

    this.ipcMain.on('switchSoundOnErrors', () => {
      ovenStore.switchSoundOnErrors()
    })

    this.ipcMain.on('switchVisibleSpeedFun', () => {
      ovenStore.switchVisibleSpeedFun()
    })

    this.ipcMain.on('switchThermalProtection', () => {
      ovenStore.switchThermalProtection()
    })

    this.ipcMain.on('switchThermocoupleCorrection', () => {
      ovenStore.switchThermocoupleCorrection()
    })

    this.ipcMain.on('clearCriticalError', () => {
      ovenStore.clearCriticalError()
    })

    this.ipcMain.on('clearErrorStore', () => {
      ovenStore.clearErrorStore()
    })

    this.ipcMain.on('calibratePoint', (_event, newPoint) => {
      const point = {temp: Number(newPoint.temp), coef: Number(newPoint.coef)}
      ovenStore.ovenManager.api.CalibrateTemp.calibratePoint(point)
    })

    this.ipcMain.on('resetCalibrate', () => {
      ovenStore.ovenManager.api.CalibrateTemp.resetCalibrate()
    })


    this.ipcMain.on('init-profiles', (event) => {
      event.reply('init-profiles-client', ovenStore.profilesStore.getProfiles())
    })

    this.ipcMain.on('remove', (filepath) => {
      ovenStore.profilesStore.remove(filepath)
    })

    this.ipcMain.on('updatePointsByShelves', (_event, profileData) => {
      ovenStore.profilesStore.updatePointsByShelves(profileData)
    })

    this.ipcMain.on('updateShelvesByPoints', (_event, profileData) => {
      ovenStore.profilesStore.updateShelvesByPoints(profileData)
    })

    this.emmiter.on('init-profiles-client--sync', () => {
      webContents.send(
        'init-profiles-client',
        ovenStore.profilesStore.getProfiles(),
      )
    })

    this.ipcMain.on('createProfile', (event, profileData) => {
      ovenStore.profilesStore.create(profileData, () => {
        this.emmiter.emit('init-profiles-client--sync')
      })
    })

    this.ipcMain.on('removeProfile', (event, filepath) => {
      ovenStore.profilesStore.remove(filepath, () => {
        this.emmiter.emit('init-profiles-client--sync')
      })
    })

    this.ipcMain.on('updateProfile', (event, profileData, profilePath) => {
      ovenStore.profilesStore.update(profileData, profilePath, () => {
        this.emmiter.emit('init-profiles-client--sync')
      })
    })

    this.ipcMain.on('onIdle', () => {
      ovenStore.onIdle()
    })

    this.ipcMain.on('funOnPi', () => {
      ovenStore.funOnPi()
    })

    this.ipcMain.on('funOffPi', () => {
      ovenStore.funOffPi()
    })

    this.ipcMain.on('setHeaterOnTest', (_, nextHeaters) => {
      ovenStore.setHeaterOnTest(nextHeaters)
    })

    this.ipcMain.on('setIndicatorWithCancel', (_, key, value) => {
      ovenStore.setIndicatorWithCancel(key, value)
    })

    this.ipcMain.on('setTesterMode', (_, value) => {
      ovenStore.ovenManager.setTesterMode(value)
    })

    this.ipcMain.on('setFanTarget', (_, value) => {
      ovenStore.setFanTarget(value)
    })

    this.ipcMain.on('onCloseErrorFunModal', (_, closeProgress) => {
      ovenStore.onCloseErrorFunModal(closeProgress)
    })

    this.ipcMain.on('update-app', () => {
      ovenStore.updateApp()
    })

    this.ipcMain.on('update-Wifi-Aps', () => {
      ovenStore.updateWifiAps()
    })

    this.ipcMain.on('on-wifi-ap', () => {
      ovenStore.onWifiAp()
    })

    this.ipcMain.on('off-wifi-ap', () => {
      ovenStore.offWifiAp()
    })

    this.ipcMain.on('connect-Wifi-Ap', (_event, args) => {
      ovenStore.connectWifiAp(args)
    })

    this.ipcMain.on('disconnect-Wifi-Ap', (_event, args) => {
      ovenStore.disconnectWifiAp(args)
    })

    this.ipcMain.on('downloadApp', () => {
      ovenStore.downloadApp()
    })

    this.ipcMain.on('installApp', () => {
      ovenStore.installApp()
    })
  }
}
