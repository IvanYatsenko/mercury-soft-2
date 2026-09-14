import { TCORRECT400 } from '../Constants/CONST'
import Api from '../Entities/Api/Api'
import { CalibrateTemp } from './CalibrateTemp'

class ApiProxy400 extends Api {
  constructor(eventEmmiter, api, thermocoupleCorrectionPtr, connectorsBoard) {
    super()
    this.api = api
    this.emmiter = eventEmmiter
    this.connectors = connectorsBoard.get('v400')
    this.emmiter.on('setCalibrate', (data) => {
      this.tCorrectTable = data
    })

    this.CalibrateTemp = new CalibrateTemp(this.emmiter, TCORRECT400, '400')

    this.thermocoupleCorrectionPtr = thermocoupleCorrectionPtr

    this.lastTemp = {
      t12int: 0,
      t1: 0,
      t2: 0,
      t34int: 0,
      t3: 0,
      t4: 0,
      t56int: 0,
      t5: 0,
      t6: 0,
      dc0: 0,
      dc1: 0,
      val1: 0,
      val2: 0
    }

    this.lastHeaters = {
      nth: 0,
      infrared3: false,
      convection: false,
      bottomHeater: false,
      topHeater: false,
      f1: false,
      infrared2: false,
      infrared: false
    }

    this.lastIndicators = {
      i1: false,
      i2: false,
      i3: false,
      i4: false,
      i5: false,
      i6: false,
      i7: false,
      i8: false
    }

    this.lastSensors = {
      fan0: 0,
      fan1: 0,
      fan2: 0,
      fan4: 0,
      fans5_8: 0,
      fan220_1: 0,
      fan220_2: 0
    }
  }

  getHeaters = () => {
    let result

    if (this.api.typeBoard) {
      result = this.api
        .getHeaters()
        .then(([...args]) => {
          let heaters = Object.entries(this.connectors.type220).reduce(
            (acc, [key, index]) => {
              if (args[index] !== undefined) {
                acc[key] = Boolean(args[index])
              }
              return acc
            },
            {}
          )

          this.lastHeaters = heaters
          return { ...heaters }
        })
        .catch(() => {
          this.emmiter.emit('oven-store-error', 'itmpError')
          return { ...this.lastHeaters }
        })
    } else {
      result = this.api
        .getHeaters()
        .then(([...args]) => {
          let heaters = Object.entries(this.connectors.type380).reduce(
            (acc, [key, index]) => {
              if (args[index] !== undefined) {
                acc[key] = Boolean(args[index])
              }
              return acc
            },
            {}
          )

          this.lastHeaters = heaters
          return { ...heaters }
        })
        .catch(() => {
          this.emmiter.emit('oven-store-error', 'itmpError')
          return { ...this.lastHeaters }
        })
    }

    return result
  }

  getIndicators = () =>
    this.api
      .getIndicators()
      .then(([i1, i2, i3, i4, i5, i6, i7, i8]) => {
        let indicators = {
          i1: Boolean(i1),
          i2: Boolean(i2),
          i3: Boolean(i3),
          i4: Boolean(i4),
          i5: Boolean(i5),
          i6: Boolean(i6),
          i7: Boolean(i7),
          i8: Boolean(i8)
        }
        this.lastIndicators = indicators
        return { ...indicators }
      })
      .catch(() => {
        this.emmiter.emit('oven-store-error', 'itmpError')
        return { ...this.lastIndicators }
      })

  setIndicators = ({ i1, i2, i3, i4, i5, i6, i7, i8 }) =>
    this.api.setIndicators([i1, i2, i3, i4, i5, i6, i7, i8]).catch(() => {
      this.emmiter.emit('oven-store-error', 'itmpError')
    })

  getSensors = () =>
    this.api
      .getSensors()
      .then(([fan0, fan1, fan2, fan4, fans5_8, fan220_1, fan220_2]) => {
        let sensors = { fan0, fan1, fan2, fan4, fans5_8, fan220_1, fan220_2 }
        this.lastSensors = sensors
        return { ...sensors }
      })
      .catch(() => {
        this.emmiter.emit('oven-store-error', 'itmpError')
        return { ...this.lastSensors }
      })

  setHeaters = ({
    infrared3,
    convection,
    bottomHeater,
    topHeater,
    f1,
    infrared2,
    infrared
  }) => {
    let heaters = []
    if (this.api.typeBoard) {
      heaters = [
        0,
        Number(infrared3),
        Number(convection),
        Number(bottomHeater),
        Number(topHeater),
        Number(f1),
        Number(infrared2),
        Number(infrared)
      ]
    } else {
      heaters = [
        0,
        Number(infrared3),
        Number(bottomHeater),
        Number(convection),
        Number(topHeater),
        Number(infrared2),
        Number(f1),
        Number(infrared)
      ]
    }
    return this.api.setHeaters(heaters).catch((err) => {
      this.emmiter.emit('oven-store-error', 'itmpError')
      throw err
    })
  }

  getTemperature = () =>
    this.api
      .getTemperature()
      .then(
        ([
          t12int,
          t1,
          t2,
          t34int,
          ,
          ,
          t56int,
          ,
          ,
          dc0,
          dc1,
          stat,
          val1,
          val2
        ]) => {
          let temp =
            this.api.getVersion() < 2
              ? {
                  t1: this.convertTemperature(t1, t12int), // board термопара
                  t2: this.convertTemperature(t2, t12int), // Задняя термопара
                  t3: 0,
                  t4: 0,
                  t5: 0,
                  t6: 0,
                  t7: this.average([t12int]),
                  t12int,
                  t34int,
                  t56int,
                  dc0,
                  dc1,
                  stat,
                  val1,
                  val2
                }
              : {
                  t1: this.convertTemperatureNew(t1), // board термопара
                  t2: this.convertTemperatureNew(t2), // Задняя термопара
                  t3: 0,
                  t4: 0,
                  t5: 0,
                  t6: 0,
                  t7: t12int,
                  t12int,
                  t34int,
                  t56int,
                  dc0,
                  dc1,
                  stat,
                  val1,
                  val2
                }

          temp['t2'] = this.correctTemp(temp['t2'])

          this.lastTemp = temp
          return { ...temp }
        }
      )
      .catch((e) => {
        this.emmiter.emit('oven-store-error', 'itmpError', e)
        return { ...this.lastTemp }
      })

  correctTemp = (t) => {
    if (t < 30) {
      return t
    }

    if (t > 330) {
      return t
    }

    if (!this.thermocoupleCorrectionPtr[0]) {
      return t
    }

    const bIdx = this.tCorrectTable.findIndex((c) => c.temp >= t)

    if (bIdx < 1) {
      return t
    }

    const b1 = this.tCorrectTable[bIdx - 1]
    const b2 = this.tCorrectTable[bIdx]
    let tbDist = b2.temp - b1.temp

    let weight = (t - b1.temp) / tbDist

    let k = b1.coef * (1 - weight) + b2.coef * weight

    // console.log('correctTemp', t, Math.round(k * t), k)

    return Math.round(k * t)
  }

  convertTemperature = (U, TC) => {
    const temperature = 24.5809 * (((TC / 32) * 0.039986) ** 1.01 + U / 128)
    return Math.round(temperature)
  }

  convertTemperatureNew = (T) => {
    const temperature = T / 4
    return Math.round(temperature)
  }

  average = (params) => {
    const arr = params.sort()
    return Math.round(arr[Math.floor(arr.length / 2)] / 32)
  }

  setStat = (arg = 3) => this.api.setStat([arg])

  getStat = () => this.api.getStat()

  setPowerOff = () => {
    this.api.setPowerOff()
  }
}

export default ApiProxy400
