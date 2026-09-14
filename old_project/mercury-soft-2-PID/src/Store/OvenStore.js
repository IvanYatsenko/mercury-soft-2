import { makeAutoObservable, runInAction } from 'mobx'
import ProfilesStore from './ProfilesStore'

class OvenStore {
  totalTime = 0
  deviationProfileSheldule = 0
  tableCorrect = []
  moveFile = false
  removeFile = false
  unzipFile = false
  chmodeFile = false
  readyToUpdate = false
  _checkFlagMD5 = false
  errorDownloadFile = false
  downloadFlag = false
  profileName = null
  profileData = {}
  version = ''
  ip = ''
  buzyProfile = ''
  debugMode = false
  errorFlag = false
  warningFlag = false
  stat = null
  temperature = { t1: 0, t2: 0 }
  heat = false
  convFreq = { Hz: 0, rel: 0 }
  convFreqSpeed = 0
  mercuryType = 400
  progress = []
  timeHorizon = 0
  coreTemp = 0
  fanTarget = 0
  errorStore = {
    profileError: 0,
    fanError: 0,
    doorError: 0,
    ovenTempError: 0,
    itmpError: 0,
  }

  heaters = {
    topHeater: false,
    bottomHeater: false,
    convection: false,
    infrared: false,
    infrared2: false,
    infrared3: false,
    f2: false,
    f1: false,
  }

  indicators = {
    i1: false,
    i2: false,
    i3: false,
    i4: false,
    i5: false,
    i6: false,
    i7: false,
    i8: false,
  }

  i = {}

  listAP = []

  errorOnFan = true

  soundOnErrors = true

  criticalError = false

  deviationsPoints = []

  deviationProfileShelduleMax = 0

  constructor(connect) {
    makeAutoObservable(this)
    this.connect = connect
    this.profilesStore = new ProfilesStore(connect, this)
    if (window.ipcRenderer) {
      this.connect.on('connect-main-client', (_event, args) => {
        const {
          totalTime,
          tableCorrect,
          deviationProfileShelduleMax,
          deviationsPoints,
          deviationProfileSheldule,
          debugMode,
          moveFile,
          removeFile,
          unzipFile,
          chmodeFile,
          readyToUpdate,
          _checkFlagMD5,
          errorDownloadFile,
          downloadFlag,
          versionToUpdate,
          updateFlag,
          profileData,
          profileName,
          buzyProfile,
          listAP,
          statusAP,
          errorFlag,
          warningFlag,
          stat,
          coreTemp,
          convFreq,
          convFreqSpeed,
          criticalError,
          error,
          errorOnFan,
          errorStore,
          fanTarget,
          heat,
          heatIndicators,
          heaters,
          i,
          indicators,
          ip,
          isErrorFunModal,
          isVisibleFunSpeed,
          mercuryType,
          progress,
          timeHorizon,
          repeat,
          sensors,
          soundOnErrors,
          state,
          temperature,
          thermalProtection,
          thermocoupleCorrection,
          version,
        } = args
        runInAction(() => {
          this.totalTime = totalTime
          this.tableCorrect = tableCorrect
          this.deviationProfileShelduleMax = deviationProfileShelduleMax
          this.deviationsPoints = deviationsPoints
          this.deviationProfileSheldule = deviationProfileSheldule
          this.debugMode = debugMode
          this.moveFile = moveFile
          this.removeFile = removeFile
          this.unzipFile = unzipFile
          this.chmodeFile = chmodeFile
          this.readyToUpdate = readyToUpdate
          this._checkFlagMD5 = _checkFlagMD5
          this.errorDownloadFile = errorDownloadFile
          this.downloadFlag = downloadFlag
          this.versionToUpdate = versionToUpdate
          this.updateFlag = updateFlag
          this.profileData = JSON.parse(profileData)
          this.profileName = profileName
          this.buzyProfile = buzyProfile
          this.listAP = listAP
          this.errorFlag = errorFlag
          this.warningFlag = warningFlag
          this.stat = stat
          this.timeHorizon = timeHorizon
          this.convFreq = convFreq
          this.convFreqSpeed = convFreqSpeed
          this.criticalError = criticalError
          this.error = error
          this.errorOnFan = errorOnFan
          this.errorStore = errorStore
          this.fanTarget = fanTarget
          this.heat = heat
          this.heatIndicators = heatIndicators
          this.heaters = { ...heaters }
          this.i = { ...i }
          this.indicators = indicators
          this.ip = ip
          this.isErrorFunModal = isErrorFunModal
          this.isVisibleFunSpeed = isVisibleFunSpeed
          this.mercuryType = mercuryType
          this.progress = progress
          this.repeat = repeat
          this.sensors = sensors
          this.soundOnErrors = soundOnErrors
          this.state = state
          this.temperature = { ...temperature }
          this.thermalProtection = thermalProtection
          this.thermocoupleCorrection = thermocoupleCorrection
          this.isLoading = false
          this.coreTemp = coreTemp
          this.version = version
          this.statusAP = statusAP
        })
      })
      setInterval(() => {
        this.connect.send('load-ready-main-client')
      }, 1000)
    } else {
      this.connect.on('connect-main-client', (data) => {
        const {
          profileData,
          profileName,
          buzyProfile,
          listAP,
          statusAP,
          errorFlag,
          warningFlag,
          stat,
          coreTemp,
          convFreq,
          convFreqSpeed,
          criticalError,
          error,
          errorOnFan,
          errorStore,
          fanTarget,
          heat,
          heatIndicators,
          heaters,
          i,
          indicators,
          ip,
          isErrorFunModal,
          isVisibleFunSpeed,
          mercuryType,
          progress,
          timeHorizon,
          repeat,
          sensors,
          soundOnErrors,
          state,
          temperature,
          thermalProtection,
          thermocoupleCorrection,
          version,
        } = data

        runInAction(() => {
          this.profileData = JSON.parse(profileData)
          this.profileName = profileName
          this.buzyProfile = buzyProfile
          this.listAP = listAP
          this.errorFlag = errorFlag
          this.warningFlag = warningFlag
          this.stat = stat
          this.timeHorizon = timeHorizon
          this.convFreq = convFreq
          this.convFreqSpeed = convFreqSpeed
          this.criticalError = criticalError
          this.error = error
          this.errorOnFan = errorOnFan
          this.errorStore = errorStore
          this.fanTarget = fanTarget
          this.heat = heat
          this.heatIndicators = heatIndicators
          this.heaters = { ...heaters }
          this.i = { ...i }
          this.indicators = indicators
          this.ip = ip
          this.isErrorFunModal = isErrorFunModal
          this.isVisibleFunSpeed = isVisibleFunSpeed
          this.mercuryType = mercuryType
          this.progress = progress
          this.repeat = repeat
          this.sensors = sensors
          this.soundOnErrors = soundOnErrors
          this.state = state
          this.temperature = { ...temperature }
          this.thermalProtection = thermalProtection
          this.thermocoupleCorrection = thermocoupleCorrection
          this.isLoading = false
          this.coreTemp = coreTemp
          this.version = version
          this.statusAP = statusAP
        })
      })
      setInterval(() => {
        this.connect.emit('load-ready-main-client')
      }, 1000)
    }
  }

  offFinishSound() {
    if (window.ipcRenderer) {
      this.connect.send('offFinishSound')
    }
  }

  calibratePoint(newPoint) {
    if (window.ipcRenderer) {
      this.connect.send('calibratePoint', newPoint)
    }
  }

  resetCalibrate() {
    if (window.ipcRenderer) {
      this.connect.send('resetCalibrate')
    }
  }

  keepHeat() {
    if (window.ipcRenderer) {
      this.connect.send('keepHeat')
    } else {
      this.connect.emit('keepHeat')
    }
  }

  startToCalibrate(temp) {
    if (window.ipcRenderer) {
      this.connect.send('startToCalibrate', temp)
    }
  }

  closeProgressPage = () => {
    if (window.ipcRenderer) {
      this.connect.send('closeProgressPage')
    } else {
      this.connect.emit('closeProgressPage')
    }
  }

  switchErrorOnFan() {
    if (window.ipcRenderer) {
      this.connect.send('switchErrorOnFan')
    } else {
      this.connect.emit('switchErrorOnFan')
    }
  }

  switchSoundOnErrors() {
    if (window.ipcRenderer) {
      this.connect.send('switchSoundOnErrors')
    } else {
      this.connect.emit('switchSoundOnErrors')
    }
  }

  switchVisibleSpeedFun() {
    if (window.ipcRenderer) {
      this.connect.send('switchVisibleSpeedFun')
    } else {
      this.connect.emit('switchVisibleSpeedFun')
    }
  }

  switchThermalProtection() {
    if (window.ipcRenderer) {
      this.connect.send('switchThermalProtection')
    } else {
      this.connect.emit('switchThermalProtection')
    }
  }

  clearCriticalError() {
    if (window.ipcRenderer) {
      this.connect.send('clearCriticalError')
    } else {
      this.connect.emit('clearCriticalError')
    }
  }

  clearErrorStore() {
    if (window.ipcRenderer) {
      this.connect.send('clearErrorStore')
    } else {
      this.connect.emit('clearErrorStore')
    }
  }
  // clearErrorStore

  switchThermocoupleCorrection() {
    if (window.ipcRenderer) {
      this.connect.send('switchThermocoupleCorrection')
    } else {
      this.connect.emit('switchThermocoupleCorrection')
    }
  }

  startEvent(filepath) {
    if (window.ipcRenderer) {
      this.connect.send('startEvent', filepath)
    } else {
      this.connect.emit('startEvent', filepath)
    }
  }

  onIdle() {
    if (window.ipcRenderer) {
      this.connect.send('onIdle')
    } else {
      this.connect.emit('onIdle')
    }
  }

  funOnPi() {
    if (window.ipcRenderer) {
      this.connect.send('funOnPi')
    } else {
      this.connect.emit('funOnPi')
    }
  }

  funOffPi() {
    if (window.ipcRenderer) {
      this.connect.send('funOffPi')
    } else {
      this.connect.emit('funOffPi')
    }
  }

  setHeaterOnTest(nextHeaters) {
    if (window.ipcRenderer) {
      this.connect.send('setHeaterOnTest', nextHeaters)
    } else {
      this.connect.emit('setHeaterOnTest', nextHeaters)
    }
  }

  setIndicatorWithCancel(key, value) {
    if (window.ipcRenderer) {
      this.connect.send('setIndicatorWithCancel', key, value)
    } else {
      this.connect.emit('setIndicatorWithCancel', key, value)
    }
  }

  setTesterMode(value) {
    if (window.ipcRenderer) {
      this.connect.send('setTesterMode', value)
    } else {
      this.connect.emit('setTesterMode', value)
    }
  }

  setFanTarget(value) {
    if (window.ipcRenderer) {
      this.connect.send('setFanTarget', value)
    } else {
      this.connect.emit('setFanTarget', value)
    }
  }

  onCloseErrorFunModal() {
    if (window.ipcRenderer) {
      this.connect.send('onCloseErrorFunModal')
    }
  }

  switchMercuryType = () => {
    if (window.ipcRenderer) {
      this.connect.send('switchMercuryType')
    }
  }

  switchDebugMode = () => {
    if (window.ipcRenderer) {
      this.connect.send('switchDebugMode')
    }
  }

  setRepeate = (repeate) => {
    if (window.ipcRenderer) {
      this.connect.send('setRepeate', repeate)
    }
  }

  updateApp = () => {
    if (window.ipcRenderer) {
      this.connect.send('update-app')
    }
  }

  downloadApp = () => {
    if (window.ipcRenderer) {
      this.connect.send('downloadApp')
    }
  }

  installApp = () => {
    if (window.ipcRenderer) {
      this.connect.send('installApp')
    }
  }

  updateWifiAps = () => {
    if (window.ipcRenderer) {
      this.connect.send('update-Wifi-Aps')
    } else {
      this.connect.emit('update-Wifi-Aps')
    }
  }

  onWifiAp = () => {
    if (window.ipcRenderer) {
      this.connect.send('on-wifi-ap')
    } else {
      this.connect.emit('on-wifi-ap')
    }
  }

  offWifiAp = () => {
    if (window.ipcRenderer) {
      this.connect.send('off-wifi-ap')
    } else {
      this.connect.emit('off-wifi-ap')
    }
  }
  connectWifiAp = (args) => {
    if (window.ipcRenderer) {
      this.connect.send('connect-Wifi-Ap', args)
    } else {
      this.connect.emit('connect-Wifi-Ap', args)
    }
  }

  disconnectWifiAp = (args) => {
    if (window.ipcRenderer) {
      this.connect.send('disconnect-Wifi-Ap', args)
    } else {
      this.connect.emit('disconnect-Wifi-Ap', args)
    }
  }
}

export default OvenStore
