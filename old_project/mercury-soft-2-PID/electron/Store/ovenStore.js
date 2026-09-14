import { exec } from 'node:child_process'
import { createRequire } from 'node:module'
import { CALIBRATE_PROFILE } from '../Constants/CONST'

const require = createRequire(import.meta.url)
var Mutex = require('async-mutex').Mutex

const fs = require('fs')
const https = require('https')

class OvenStore {
  constructor(ovenManager, soundManager, timeController) {
    this.deviationProfileShelduleMax = 0
    this.deviationProfileSheldule = 0
    this.deviationsPoints = []
    this.readyToUpdate = false
    this.ovenManager = ovenManager
    this.soundManager = soundManager
    this.timeController = timeController
    this.totalTime = {
      time: 0,
      start: 0
    }
    this.state = ovenManager.state.current.name
    this.error = false
    this.heat = false
    this.initIter = true
    this.debugMode = false
    this._flagPowerOff = false
    this.deviationsPoints = []
    this.tableCorrect = ovenManager.api.CalibrateTemp.tableCorrect

    this.warningFlag = false
    this.errorFlag = false

    this.errorOnFan = ovenManager.store.get('errorOnFan', true)
    // console.log("errorOnFan:", this.errorOnFan)

    this.isVisibleFunSpeed = ovenManager.store.get('isVisibleFunSpeed', false)

    this.soundOnErrors = ovenManager.store.get('soundOnErrors', true)

    this.urlUpdate = ovenManager.store.get('urlUpdate', 'https://www.nsc-com.com/soft/mercury')

    this.mercuryType = ovenManager.store.get('mercuryType', '300')
    // console.log("mercuryType:", this.mercuryType)

    this.thermocoupleCorrection = ovenManager.getThermocoupleCorrection()
    // console.log("thermocoupleCorrection:", this.thermocoupleCorrection)

    this.thermalProtection = ovenManager.thermalProtection
    // console.log("thermalProtection:", this.thermalProtection)

    this.fanTarget = ovenManager.store.get('fanTarget', 50)
    // console.log("fanTarget:", this.fanTarget)

    this.version = ovenManager.store.get('version')

    this.getStatusWifiAp()

    this.ip = ''

    setInterval(() => {
      this.ip = ovenManager.getIp()
      if (this.stat & (1 << 5) && !this._flagPowerOff) {
        this.powerOffPi()
        this._flagPowerOff = true
      }
      this.tableCorrect = ovenManager.api.CalibrateTemp.tableCorrect
      this.totalTime = {
        time: timeController.oldCount,
        start: timeController.dirName
      }
      ovenManager.getMonitoringStatus()
    }, 2000)

    ovenManager.on('get-monitorting-status', () => {
      ovenManager.monitoringStatus = {
        profile: this.profileData,
        heatIndicators: this.heatIndicators,
        status: this.state,
        state: {
          coreTemp: `${(this.coreTemp / 1000).toFixed(2)}°C`,
          timeHorizon: this.timeHorizon,
          temperature: this.temperature.t7,
          convFreq: this.convFreq,
          second: this.second,
          i: this.i,
          sensors: this.sensors,
          profileName: this.profileName,
          indicators: this.data.indicators
        },
        progress: [
          ...this.progress.map((s) => {
            return {
              second: s.second,
              temperature: s.temperature,
              heaters: s.heaters
            }
          })
        ],
        errorStore: this.errorStore,
        version: this.version
      }
    })

    ovenManager.on('oven-state-changed', (state) => {
      if (this.state !== state) {
        this.state = state

        if (state == 'finish') {
          this.onFinish()
          // console.log('FINISH!')
        } else if (state == 'idle') {
          this.onIdle()
        }
      }
    })

    ovenManager.on('oven-store-error', (errorName) => {
      this.errorStore[errorName] = (this.errorStore[errorName] || 0) + 1
    })

    ovenManager.on('oven-critical-error', (error) => {
      this.criticalError = error
      if (error) {
        this.repeat = 1
        this.keepHeat(false)
      }
      this.setError()
    })

    ovenManager.on(
      'oven-idle-event',
      ({ temperature, indicators, i, sensors, stat }) => {
        this.temperature = temperature
        this.stat = stat
        this.convFreq.Hz = temperature.val1
        this.convFreqSpeed = temperature.val1
        this.convFreq.rel = temperature.val1 / this.fanTarget

        for (const entry of Object.entries(indicators)) {
          this.indicators[entry[0]] = entry[1]
        }
        if (this.initIter) {
          this.indicators.i5 = false
          this.indicators.i6 = false
          this.initIter = false
        }

        this.i = i
        this.sensors = sensors
        this.error = false
        this.setError()
        try {
          this.coreTemp = fs.readFileSync(
            '/sys/devices/virtual/thermal/thermal_zone0/temp',
            'utf8'
          )
        } catch {
          this.coreTemp = 0
        }
        this.setFan()
      }
    )

    ovenManager.on('oven-heaters-update', ({ heaters }) => {
      for (const entry of Object.entries(heaters)) {
        this.heaters[entry[0]] = entry[1]
      }
    })

    ovenManager.on('oven-heat-mode', ({ mode, power }) => {
      power = Math.min(1, Math.max(power, 0))

      let intPower = power * 100
      let remainder = intPower % 20
      intPower = intPower - remainder + (remainder > 0 ? 20 : 0)

      if (mode == 'bothHeaters') {
        this.heatIndicators.tens = intPower
        this.heatIndicators.IR = 0
        this.heatIndicators.convection = 100
        this.heatIndicators.fans = 0
      } else if (mode == 'convection') {
        this.heatIndicators.tens = 0
        this.heatIndicators.IR = 0
        this.heatIndicators.convection = 100
        this.heatIndicators.fans = 0
      } else if (mode == 'cooling') {
        this.heatIndicators.tens = 0
        this.heatIndicators.IR = 0
        this.heatIndicators.convection = 100
        this.heatIndicators.fans = intPower
      } else if (mode == 'light') {
        this.heatIndicators.tens = 100
        this.heatIndicators.IR = intPower
        this.heatIndicators.convection = 100
        this.heatIndicators.fans = 0
      } else if (mode == 'off') {
        this.heatIndicators.tens = 0
        this.heatIndicators.IR = 0
        this.heatIndicators.convection = 0
        this.heatIndicators.fans = 0
      }
    })

    ovenManager.on('oven-progress', (progress) => {
      if (progress.length === 0) {
        this.progress = []
        this.deviationsPoints = []
        this.deviationProfileSheldule = 0
        this.deviationProfileShelduleMax = 0
        return
      }

      const lastEvent = progress[progress.length - 1]
      this.convFreq.Hz = lastEvent.temperature.val1
      this.convFreqSpeed = lastEvent.temperature.val1
      this.convFreq.rel = lastEvent.temperature.val1 / this.fanTarget

      if (lastEvent.i.door === 0) {
        if (progress.length > 1 && this.progress.length > 0) {
          const prevEvent = progress[progress.length - 2]
          const currentEvent =
            this.progress && this.progress[this.progress.length - 1]
          if (prevEvent.second !== currentEvent.second) {
            this.progress = progress.map((s) => ({
              second: s.second,
              temperature: s.temperature,
              heaters: s.heaters
            }))
          } else {
            this.progress.push({
              second: lastEvent.second,
              temperature: lastEvent.temperature,
              heaters: lastEvent.heaters
            })
          }
        } else {
          this.progress.push({
            second: lastEvent.second,
            temperature: lastEvent.temperature,
            heaters: lastEvent.heaters
          })
        }
      }
      this.second = lastEvent.second
      this.temperature = lastEvent.temperature
      this.error = lastEvent.error
      this.timeHorizon = lastEvent.timeHorizon
      this.i = lastEvent.i
      this.setError()
      try {
        this.coreTemp = fs.readFileSync(
          '/sys/devices/virtual/thermal/thermal_zone0/temp',
          'utf8'
        )
      } catch {
        this.coreTemp = 0
      }
      this.setFan()
    })

    ovenManager.on('oven-store-deviation', (value) => {
      this.deviationProfileSheldule = Math.abs(value.toFixed(1))
      if (this.deviationProfileShelduleMax < this.deviationProfileSheldule) {
        this.deviationProfileShelduleMax = this.deviationProfileSheldule
      }
      if (
        this.progress[this.progress.length - 1] &&
        this.deviationProfileSheldule > 3.5
      ) {
        this.deviationsPoints.push(this.progress[this.progress.length - 1])
      }
    })

    ovenManager.api.setStat(2)

    soundManager.setSoundCallback((state) => {
      this.setIndicator({ i4: state })
    })
  }

  setIp = (ip) => {
    this.ip = ip
  }

  onWifiAp = () => {
    exec(`nmcli radio wifi on`, (error, stdout, stderr) => {
      if (error) {
        console.error(`error: ${error.message}`)
        return
      }

      if (stderr) {
        console.error(`stderr: ${stderr}`)
        return
      }

      console.log('stdout', stdout)
      setTimeout(() => {
        this.getStatusWifiAp()
      }, 8000)
    })
  }

  offWifiAp = () => {
    exec(`nmcli radio wifi off`, (error, stdout, stderr) => {
      if (error) {
        console.error(`error: ${error.message}`)
        return
      }

      if (stderr) {
        console.error(`stderr: ${stderr}`)
        return
      }

      console.log('stdout', stdout)
      setTimeout(() => {
        this.getStatusWifiAp()
      }, 5000)
    })
  }

  getStatusWifiAp = () => {
    exec(`nmcli radio wifi`, (error, stdout, stderr) => {
      if (error) {
        console.error(`error: ${error.message}`)
        return
      }

      if (stderr) {
        console.error(`stderr: ${stderr}`)
        return
      }

      console.log(stdout)
      this.setStatusWifiAp(stdout)
    })
  }

  setStatusWifiAp = (value) => {
    this.statusAP = value == 'enabled\n'
  }

  disconnectWifiAp = (args) => {
    console.log(args)
    exec(`nmcli connection down ${args.name}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`error: ${error.message}`)
        return
      }

      if (stderr) {
        console.error(`stderr: ${stderr}`)
        return
      }
      this.updateWifiAps()
    })
  }

  connectWifiAp = (args) => {
    exec(
      `nmcli dev wifi con ${args.name} password ${args.pass}`,
      (error, stdout, stderr) => {
        if (error) {
          console.error(`error: ${error.message}`)
          return
        }

        if (stderr) {
          console.error(`stderr: ${stderr}`)
          return
        }
        this.updateWifiAps()
      }
    )
  }

  powerOffPi = () => {
    this.ovenManager.api.setPowerOff()
    try {
      exec(
        `systemctl --user stop mercury-v2.service`,
        (error, stdout, stderr) => {
          if (error) {
            console.error(`error: ${error.message}`)
            return
          }

          if (stderr) {
            console.error(`stderr: ${stderr}`)
            return
          }
          exec(`shutdown`, (error, stdout, stderr) => {
            if (error) {
              console.error(`error: ${error.message}`)
              return
            }

            if (stderr) {
              console.error(`stderr: ${stderr}`)
              return
            }
          })
        }
      )
    } catch (e) {
      console.log(e)
    }
  }

  updateWifiAps = () => {
    exec(
      `nmcli dev wifi list | sed -e 's/^\\s/0 /' -e 's/^*/1 /' | awk '{print $1F " : " $3F " : " $8F}' | sed -e '/--/d'`,
      (error, stdout, stderr) => {
        if (error) {
          console.error(`error: ${error.message}`)
          return
        }

        if (stderr) {
          console.error(`stderr: ${stderr}`)
          return
        }

        const res = stdout.toString().split('\n')
        res.shift()
        res.pop()

        this.listAP = res.map((str) => {
          const res = str.split(' : ')
          return {
            status: res[0] == '1' ? true : false,
            name: res[1],
            signal: Number(res[2])
          }
        })
      }
    )
  }

  updateApp() {
    fetch(`${this.urlUpdate}/version`)
      .then((res) => res.text())
      .then((text) => {
        this._fileToUpdateSummMD5 = text.split(' ')[1].trim()

        this.versionToUpdate = text.split(' ')[0]
        this.updateFlag = this.checkCurrentVersion()
      })
  }

  checkCurrentVersion = () => {
    if (this.versionToUpdate.split('.')[0] > this.version.split('.')[0]) {
      return false
    }

    if (this.versionToUpdate.split('.')[1] > this.version.split('.')[1]) {
      return false
    }

    if (this.versionToUpdate.split('.')[2] > this.version.split('.')[2]) {
      return false
    }

    return true
  }

  checkFileUpdateApp() {
    this._checkFlagMD5 = true
    exec(
      `md5sum ${this.versionToUpdate}_linux-arm64-unpacked.tar.gz`,
      (error, stdout, stderr) => {
        if (error) {
          console.error(`error: ${error.message}`)
          return
        }

        if (stderr) {
          console.error(`stderr: ${stderr}`)
          return
        }

        if (
          stdout.toString().split(' ')[0].trim() == this._fileToUpdateSummMD5
        ) {
          this.readyToUpdate = true
          this._checkFlagMD5 = false
        } else {
          this.errorDownloadFile = true
        }
      }
    )
  }

  downloadApp() {
    try {
      const url = `${this.urlUpdate}/${this.versionToUpdate}_linux-arm64-unpacked.tar.gz`
      const filePath = `${this.versionToUpdate}_linux-arm64-unpacked.tar.gz`
      this.downloadFlag = true
      https.get(url, (response) => {
        const fileStream = fs.createWriteStream(filePath)
        response.pipe(fileStream)
        fileStream.on('finish', () => {
          fileStream.close()
          this.downloadFlag = false
          this.checkFileUpdateApp()
        })
      })
    } catch (e) {
      console.log(e)
    }
  }

  installApp() {
    exec('rm -rfd /opt/mercury-v2/*', (error) => {
      if (!error) {
        this.removeFile = true
        exec(
          `tar xfz /home/pi/${this.versionToUpdate}_linux-arm64-unpacked.tar.gz -C /opt/`,
          (error) => {
            if (!error) {
              this.unzipFile = true
              exec('chmod a+x /opt/mercury-v2/mercury-soft-2', (error) => {
                if (!error) {
                  this.chmodeFile = true
                  exec(
                    `sed -i.bak -r 's/(\\"version\\"): \\"[0-9]+.[0-9]+.[0-9]+\\"/\\"version\\": \\"'${this.versionToUpdate}'\\"/' /home/pi/.config/mercury-soft-2/config.json`,
                    (error) => {
                      if (!error) {
                        exec(`sync`, (error, stdout, stderr) => {
                          if (!error) {
                            exec(`sudo reboot`, (error, stdout, stderr) => {
                              if (error) {
                                console.error(`${error.message}`)
                                return
                              }

                              if (stderr) {
                                console.error(`${stderr}`)
                                return
                              }
                            })
                          }
                          if (error) {
                            console.error(`${error.message}`)
                            return
                          }

                          if (stderr) {
                            console.error(`${stderr}`)
                            return
                          }
                        })
                      }
                    }
                  )
                }
              })
            }
          }
        )
      }
    })
  }

  debugMode = false

  switchDebugMode = () => {
    this.debugMode = !this.debugMode
  }

  setRepeate = (repeat) => {
    this.repeat = repeat
  }

  tableCorrect = []

  moveFile = false
  removeFile = false
  unzipFile = false
  chmodeFile = false

  versionToUpdate = '0.0.0'

  _fileToUpdateSummMD5 = ''

  _checkFlagMD5 = false

  readyToUpdate = false

  downloadFlag = false

  errorDownloadFile = false

  updateFlag = true

  coreTemp = 0

  timeHorizon = 0

  temperature = {}

  convFreq = { Hz: 0, rel: 0 }

  convFreqSpeed = 0

  second = 0

  i = {}

  sensors = {}

  progress = []

  profileName = null

  profileData = {}

  buzyProfile = ''

  data = { indicators: [] }

  error = false

  heat = false

  timerId = undefined

  board = false

  repeat = 1

  coreFanCounter = 0

  boardFanCounter = 0

  fanError = { core: false, board: false }

  heaters = {
    topHeater: false,
    bottomHeater: false,
    convection: false,
    infrared: false,
    infrared2: false,
    infrared3: false,
    f2: false,
    f1: false
  }

  heatIndicators = {
    tens: 0,
    IR: 0,
    convection: 0,
    fans: 0
  }

  indicators = {
    i1: false,
    i2: false,
    i3: false,
    i4: false,
    i5: false,
    i6: false,
    i7: false,
    i8: false
  }

  timeoutIds = {
    i1: undefined,
    i2: undefined,
    i3: undefined,
    i4: undefined,
    i5: undefined,
    i6: undefined,
    i7: undefined,
    i8: undefined
  }

  errorStore = {
    profileError: 0,
    fanError: 0,
    doorError: 0,
    ovenTempError: 0,
    itmpError: 0
  }

  timers = {}
  mutex = new Mutex()

  criticalError = false

  listAP = []

  statusAP = false

  offFinishSound = () => {
    this.setFinishSound(false)
  }

  onFinishSound = () => {
    this.setFinishSound(true)
  }

  closeProgressPage = () => {
    this.setFinishSound(false)
    this.setErrorSound(false)
    this.ovenManager.clearCriticalError()

    this.ovenManager.state.toggleState('idle').onStart()
    this._flagOpenModal = true
  }

  get profile() {
    if (this.state === 'busy' && this.ovenManager.state.current.profile) {
      this.lastProfile = this.ovenManager.state.current.profile.profile
      return this.lastProfile
    } else if (
      (this.state === 'idle' || this.state === 'finish') &&
      this.lastProfile
    ) {
      return this.lastProfile
    }
    return []
  }

  clearErrorStore = () => {
    for (const entry of Object.entries(this.errorStore)) {
      this.errorStore[entry[0]] = 0
    }
  }

  setIndicatorWithCancel = (key, value) => {
    if (value == true) {
      clearTimeout(this.timeoutIds[key])
      this.setIndicator({ [key]: value })
      this.timeoutIds[key] = setTimeout(() => {
        this.setIndicator({ [key]: !value })
      }, 10000)
    } else {
      clearTimeout(this.timeoutIds[key])
      this.setIndicator({ [key]: value })
    }
  }

  setFan = () => {
    this.setIndicator({ i7: false })

    if (this.temperature.t7 > 50) {
      this.setIndicatorWithCancel('i6', true)
    }
    if (this.temperature.t7 < 40) {
      if(!this.ovenManager.getTesterMode()) {
        this.setIndicatorWithCancel('i6', false)
      }
    }

    if (this.coreTemp > 60000) {
      this.setIndicatorWithCancel('i5', true)
      this.funOnPi()
    }

    if (this.coreTemp < 50000) {
      if(!this.ovenManager.getTesterMode()) {
        this.setIndicatorWithCancel('i5', false)
        this.funOffPi()
      }
    }
  }

  funOnPi() {
    exec('gpioset -t0 GPIO4=1', (error, stdout, stderr) => {
      if (error) {
        // console.error(`error: ${error.message}`)
        return
      }

      if (stderr) {
        // console.error(`stderr: ${stderr}`)
        return
      }

      // console.log(`stdout:\n${stdout}`)
    })
  }

  funOffPi() {
    exec('gpioset -t0 GPIO4=0', (error, stdout, stderr) => {
      if (error) {
        // console.error(`error: ${error.message}`)
        return
      }

      if (stderr) {
        // console.error(`stderr: ${stderr}`)
        return
      }

      // console.log(`stdout:\n${stdout}`)
    })
  }

  isErrorFunModal = false
  _flagOpenModal = true

  onCloseErrorFunModal(closeProgress) {
    this.isErrorFunModal = false
    this.setErrorSound(false)
    if (closeProgress) {
      this.closeProgressPage()
    }
  }

  onOpenErrorFunModal() {
    this._flagOpenModal = false
    this.isErrorFunModal = true
  }

  setError = () => {
    // const body = document.getElementById('root')

    const convFreq = this.convFreq.rel

    if (this.heaters.convection && this.state === 'busy') {
      if (convFreq < 0.5 || convFreq > 1.6) {
        this.warningFlag = true
        this.errorStore.fanError = (this.errorStore.fanError || 0) + 1
        // body.classList.add('pulse')
      }
      this.error = this.error || (this.ovenManager.errorOnFan && convFreq < 0.4)
      if (convFreq < 0.4) {
        this.errorStore.fanError = (this.errorStore.fanError || 0) + 1
      }
      if (
        this.errorOnFan &&
        (convFreq < 0.5 || convFreq > 1.6) &&
        this._flagOpenModal
      ) {
        this.warningFlag = true
        // this.errorFlag = true
        this.onOpenErrorFunModal()
      }
      if (this.isErrorFunModal) {
        if (this.soundOnErrors) {
          this.setErrorSound(true)
        }
      }
    }
    if (this.error || this.criticalError) {
      // body.classList.add('pulse')
      if (this.soundOnErrors) {
        this.setErrorSound(true)
        this.errorFlag = true
      }
    } else {
      // body.classList.remove('pulse')
      this.setErrorSound(false)
      this.warningFlag = false
      this.errorFlag = false
    }
  }

  startEvent = (profile) => {
    this.progress = []
    this.deviationProfileSheldule = 0
    this.deviationProfileShelduleMax = 0
    this.deviationsPoints = []
    this.repeat = this.repeat ? this.repeat + 1 : 2
    this.clearErrorStore()
    this.start(profile)
  }

  start = (profile) => {
    this.progress = []
    this.deviationsPoints = []
    this.deviationProfileSheldule = 0
    this.deviationProfileShelduleMax = 0
    if (this.repeat > 1) {
      this.repeat -= 1
    }
    this.profileName = profile.state.name
    this.profileData = profile
    this.buzyProfile = profile.filepath
    this.board = profile.state.board
    this.ovenManager.state
    .toggleState('busy')
    .onStart(profile.state.board, profile.absolutePoints)
    this.heat = this.ovenManager.getKeepingHeat()
    let timeAll =
      profile.absolutePoints[profile.absolutePoints.length - 1].second
    if (profile.state.repeat > 1) {
      timeAll = profile.state.repeat * timeAll
    }
    this.timeController.startProfile(profile.state.name, timeAll)
  }


  startToCalibrate = (calibrateTemp) => {
    this.progress = []
    this.deviationsPoints = []
    this.deviationProfileSheldule = 0
    this.deviationProfileShelduleMax = 0
    this._startToCalibrate = true
    const calibrateProfile = CALIBRATE_PROFILE
    let seconds = calibrateTemp - this.temperature.t2

    if(seconds < 0) {
      seconds = Math.abs(seconds) * 2
    }

    calibrateProfile.points = [
      { second: 0, temperature: this.temperature.t2 },
      { second: seconds, temperature: calibrateTemp },
      { second: 60, temperature: calibrateTemp }
    ]

    const calcAbsolutePoints = () => {
      const [first, ...rest] = calibrateProfile.points

      return rest.reduce(
        (arr, cur) => {
          const last = arr[arr.length - 1]
          arr.push({
            second: cur.second + last.second,
            temperature: cur.temperature
          })
          return arr
        },
        [first]
      )
    }

    calibrateProfile.absolutePoints = calcAbsolutePoints()

    this.profileName = calibrateProfile.state.name
    this.profileData = calibrateProfile
    this.ovenManager.state
      .toggleState('busy')
      .onStart(false, calibrateProfile.absolutePoints)
    this.heat = this.ovenManager.getKeepingHeat()
  }

  onFinish = () => {
    this.ovenManager.state.current.onEnd()
    if (this.repeat > 1) {
      this.start(this.profileData)
    } else {
      this.repeat = 1
      this.timeHorizon = 0
      this.setFinishSound(true)
    }
  }

  onIdle = () => {
    this.repeat = 1
    this.board = false
    this.progress = []
    this.deviationsPoints = []
    this.deviationProfileSheldule = 0
    this.deviationProfileShelduleMax = 0
    this.profileData = {}
    this.profileName = null
    this.buzyProfile = ''
  }

  setHeaterOnTest = async (nextHeaters) => {
    await this.mutex.runExclusive(async () => {
      const heaters = await this.ovenManager.api.getHeaters()
      await this.ovenManager.api
        .setHeaters({
          ...heaters,
          ...nextHeaters
        })
        .catch(() => {})
    })

    Object.keys(nextHeaters).forEach((key) => {
      if (['convection', 'f1', 'f2'].includes(key)) {
        return
      }
      clearInterval(this.timers[key])
      if (!nextHeaters[key]) {
        return
      }
      this.timers[key] = setTimeout(async () => {
        this.ovenManager.setTesterMode(true)
        if (!this.ovenManager.getTesterMode()) {
          return
        }
        console.log(key)
        await this.mutex.runExclusive(async () => {
          const heaters = await this.ovenManager.api.getHeaters()
          await this.ovenManager.api
            .setHeaters({
              ...heaters,
              ...{ [key]: false }
            })
            .catch(() => {})
        })
      }, 5000)
    })
  }

  switchErrorOnFan = () => {
    this.errorOnFan = !this.errorOnFan
    this.ovenManager.store.set('errorOnFan', this.errorOnFan)
  }

  switchSoundOnErrors = () => {
    this.soundOnErrors = !this.soundOnErrors
    this.ovenManager.store.set('soundOnErrors', this.soundOnErrors)
  }

  switchVisibleSpeedFun = () => {
    this.isVisibleFunSpeed = !this.isVisibleFunSpeed
    this.ovenManager.store.set('isVisibleFunSpeed', this.isVisibleFunSpeed)
  }

  switchMercuryType = () => {
    if (this.mercuryType == '300') {
      this.mercuryType = '400'
    } else {
      this.mercuryType = '300'
    }
    this.ovenManager.store.set('mercuryType', this.mercuryType)
  }

  switchThermalProtection = () => {
    this.thermalProtection = !this.thermalProtection
    this.ovenManager.store.set('thermalProtection', this.thermalProtection)
    this.ovenManager.thermalProtection = this.thermalProtection
  }

  switchThermocoupleCorrection = () => {
    this.thermocoupleCorrection = !this.thermocoupleCorrection
    this.ovenManager.setThermocoupleCorrection(this.thermocoupleCorrection)
  }

  setFanTarget = (freq) => {
    freq = Number(freq)
    if (freq < 1) {
      freq = 1
    }
    if (freq > 1000) {
      freq = 1000
    }
    this.fanTarget = freq
    this.ovenManager.store.set('fanTarget', this.fanTarget)
    this.convFreq.rel = this.convFreq.Hz / this.fanTarget
  }

  setIndicator = (nextIndicator) => {
    const { i1, i2, i3, i4, i5, i6, i7, i8 } = this.indicators
    this.ovenManager.api.setIndicators({
      i1,
      i2,
      i3,
      i4,
      i5,
      i6,
      i7,
      i8,
      ...nextIndicator
    })

    for (const entry of Object.entries(nextIndicator)) {
      this.indicators[entry[0]] = entry[1]
    }
  }

  raiseCriticalError = () => {
    this.ovenManager.setCriticalError()
  }

  clearCriticalError = () => {
    this.ovenManager.clearCriticalError()
  }

  keepHeat = (heat) => {
    this.heat = heat
    this.ovenManager.setKeepingHeat(this.heat)
  }

  /** @param {bool} enable */
  setErrorSound = (enable) => {
    this.soundManager.setErrorFlag(enable)
  }

  /** @param {bool} enable */
  setFinishSound = (enable) => {
    this.soundManager.setFinishFlag(enable)
  }

  getKeepingHeat = () => this.ovenManager.getKeepingHeat()
}

export default OvenStore
