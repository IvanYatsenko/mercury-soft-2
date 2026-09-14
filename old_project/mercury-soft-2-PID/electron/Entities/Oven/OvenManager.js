import { createRequire } from 'module'
import ApiProxy300 from '../../Proxy/ApiProxy300'
import ApiProxy400 from '../../Proxy/ApiProxy400'
import FakeApi from '../Api/FakeApi'
import PiApi from '../Api/PiApi'
import OvenState from './OvenState'
import Store from 'electron-store'

const require = createRequire(import.meta.url)
const EventEmitter = require('node:events')
const os = require('node:os')
Store.initRenderer()

class OvenManager extends EventEmitter {
  constructor() {
    super()
  }

  heat = false

  init = async () => {
    this.store = new Store()
    this.connectorsBoard = new Store({
      name: 'connectors',
      defaults: {
        v300: {
          type220: {
            infrared: 6,
            infrared2: 7,
            topHeater: 4,
            bottomHeater: 3,
            convection: 2,
            f1: 5,
            f2: 1,
            nth: 0
          },
          type380: {
            infrared: 7,
            infrared2: 5,
            topHeater: 4,
            bottomHeater: 2,
            convection: 3,
            f1: 6,
            f2: 1,
            nth: 0
          }
        },
        v400: {
          type220: {
            infrared: 7,
            infrared2: 6,
            infrared3: 1,
            topHeater: 4,
            bottomHeater: 3,
            convection: 2,
            f1: 5,
            nth: 0
          },
          type380: {
            infrared: 7,
            infrared2: 5,
            infrared3: 1,
            topHeater: 4,
            bottomHeater: 2,
            convection: 3,
            f1: 6,
            nth: 0
          }
        }
      }
    })
    // this.testerMode = false
    this.criticalError = false
    this.testerMode = false

    const comPort = this.store.get('comPort', '/dev/ttyUSB0') // "/dev/ttyS0" on Pi4
    const apiType = this.store.get('apiType', 'PiApi') // "PiApi" or "FakeApi" /

    const mercuryType = this.store.get('mercuryType', '400') // "300" or "400"
    this.thermalProtection = this.store.get('thermalProtection', true)
    this.monitorService = this.store.get('monitorService', true)
    this.version = this.store.get('version')

    this.monitoringStatus = {
      state: null,
      status: null,
      profile: null,
      temperature: null,
      progress: null
    }

    this.ip = ''

    this.thermocoupleCorrectionPtr = [
      this.store.get('thermocoupleCorrection', true)
    ]

    this.mercuryType = mercuryType

    this.api

    if (apiType == 'PiApi') {
      this.api = new PiApi(comPort)
    } else {
      this.api = new FakeApi()
    }

    await this.api.init()

    if (this.mercuryType === '300') {
      this.api = new ApiProxy300(
        this,
        this.api,
        this.thermocoupleCorrectionPtr,
        this.connectorsBoard
      )
    } else {
      this.api = new ApiProxy400(
        this,
        this.api,
        this.thermocoupleCorrectionPtr,
        this.connectorsBoard
      )
    }

    this.state = new OvenState(this, this.mercuryType)

    this.apiType = apiType
  }

  serviceIp = () => {
    const ipAddress = Object.values(os.networkInterfaces())
      .flat()
      .find((iface) => iface.family === 'IPv4' && !iface.internal)?.address
    return ipAddress
  }

  getIp = () => {
    // console.log('getip',this.serviceIp('wlan0'))
    // console.log('getip',this.serviceIp('Ethernet 2'))
    return this.serviceIp()
    // : this.serviceIp('Ethernet 2')
  }

  calcTemperature = ({ t1, t2 }, board = false) => {
    if (board === true) {
      return t1
    }
    return t2
  }

  reducer = (acc, curr) => acc + curr

  setKeepingHeat = (params) => (this.heat = params)

  getKeepingHeat = () => this.heat

  setTesterMode = (mode) => (this.testerMode = mode)

  getTesterMode = () => this.testerMode // Тестер мод - дебажная менюшка с пинкодом

  /**
   * @param {bool} state
   */
  setThermocoupleCorrection = (state) => {
    this.thermocoupleCorrectionPtr[0] = state
    this.store.set('thermocoupleCorrection', this.thermocoupleCorrectionPtr[0])
  }

  getThermocoupleCorrection = () => this.thermocoupleCorrectionPtr[0]

  setCriticalError = () => {
    this.criticalError = true
    this.emit('oven-critical-error', true)
  }

  clearCriticalError = () => {
    this.criticalError = false
    this.emit('oven-critical-error', false)
  }

  getMonitorService = () => this.monitorService

  getMonitoringStatus = () => {
    this.emit('get-monitorting-status')
    if (this.monitoringStatus) return this.monitoringStatus
  }

  setMonitorService = (state) => {
    this.monitorService = state
    this.store.set('monitorService', this.monitorService)
  }
}

export default OvenManager
