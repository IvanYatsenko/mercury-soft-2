import { createRequire } from 'module'
import Api from './Api'
import isDev from 'electron-is-dev'
const require = createRequire(import.meta.url)

const Itmp = require('itmp')

class PiApi extends Api {
  /**
   * @param {string} comPort
   */
  constructor(comPort = 'COM4') {
    super()

    // type board

    // 230V - true
    // 380V - false

    this.typeBoard = true

    // versions:
    //  0
    //  1 - add gett
    //  2 - new board format
    console.log('comPort: ', comPort)

    let url = `itmp.serial:///dev/ttyS0?baudRate=115200&dataBits=8&stopBits=1&parity=none~2`

    if(isDev) {
      url = `itmp.serial:///dev/ttyUSB0?baudRate=115200&dataBits=8&stopBits=1&parity=none~2`
    }

    this.version = 0
    this.server = Itmp.connect(url)
  }

  init = async () => {
    // console.log('Api init...')
    let connection = false
    for (let i = 0; i < 5; i++) {
      try {
        await this.server.call('get', [])
        connection = true
        break
      } catch (e) {
        console.log(e)
      }
    }
    if (!connection) {
      console.log('Connection timeout ...')
      return
    }

    let version = ''

    try {
      version = await this.server.describe('@')
    } catch (e) {
      console.log(e)
    }

    console.log('version', version)

    this.typeBoard = String(version).includes('120')

    if (version === '') {
      try {
        await this.server.call('gett', [])
        this.version = 1
      } catch (e) {
        this.version = 0
      }
    } else {
      this.version = 2
    }

    console.log('Api version:', this.version, this.typeBoard)
  }

  getVersion = () => {
    return this.version
  }
  getHeaters = () => this.server.call('setHV', [])

  setHeaters = (args) => this.server.call('setHV', args)

  getIndicators = () => {
    if (this.version == 2) {
      return this.server
        .call('setLV', [])
        .then(([red, yellow, green, sound, fan1, fan2]) => [
          red,
          yellow,
          green,
          sound,
          fan1,
          fan2,
          0,
          0,
        ])
    } else {
      return this.server.call('setLV', [])
    }
  }
  setIndicators = (args) => this.server.call('setLV', args)

  getTemperature = () => {
    if (this.version == 1) {
      return this.server
        .call('gett', [])
        .then(([t12int, t1, t2, val1]) => [
          t12int,
          t1,
          t2,
          0,
          0,
          0,
          0,  
          0,
          0,
          0,
          0,
          0,
          val1,
          0,
        ])
    } else if (this.version == 2) {
      return this.server
        .call('gett', [])
        .then(([tcpu, t1, t2, convFreq]) => [
          tcpu,
          t1,
          t2,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
          convFreq,
          0,
        ])
    } else {
      return this.server.call('get', [])
    }
  }

  setStat = (arg) => this.server.call('stat', arg)

  setPowerOff = () => this.server.call('poweroff', [5])

  getStat = () => this.server.call('stat', [])

  getSensors = () => {
    if (this.version == 2) {
      return this.server
        .call('sensors', [])
        .then(([fan1, door]) => [0, 0, 0, 0, 0, fan1, door])
    } else {
      return this.server.call('sensors', [])
    }
  }
}

export default PiApi
