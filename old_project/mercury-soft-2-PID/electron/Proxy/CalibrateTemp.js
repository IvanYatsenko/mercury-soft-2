import fs from 'fs/promises'
import { constants } from 'fs'

export class CalibrateTemp {
  constructor(eventEmmiter, defaultTableCorrect, version) {
    this.version = version
    this.emmiter = eventEmmiter
    this.defaultTableCorrect = defaultTableCorrect
    this.isDefault = true
    this.tableCorrect = defaultTableCorrect
    this.init()
  }

  init = () => {
    fs.access(`calibrate-${this.version}.json`, constants.W_OK)
      .then(() => {
        fs.readFile(`calibrate-${this.version}.json`)
          .then((data) => JSON.parse(data))
          .then((correctTable) => {
            this.tableCorrect = correctTable
            this.setCalibrate()
          })
          .catch(() => {
            this.setCalibrate()
          })
      })
      .catch(() => {
        fs.writeFile(
          `calibrate-${this.version}.json`,
          JSON.stringify(this.defaultTableCorrect),
          (err) => {
            if (err) {
              console.log(err)
            }
          },
        )
        this.setCalibrate()
      })
  }

  setCalibrate = () => {
    this.emmiter.emit('setCalibrate', this.tableCorrect)
  }

  resetCalibrate() {
    this.emmiter.emit('setCalibrate', this.defaultTableCorrect)
    this.tableCorrect = this.defaultTableCorrect
    this.saveCalibrate()
  }

  saveCalibrate = () => {
    fs.access(`calibrate-${this.version}.json`, constants.W_OK)
      .then(() => {
        fs.writeFile(
          `calibrate-${this.version}.json`,
          JSON.stringify(this.tableCorrect),
          (err) => {
            if (err) {
              console.log(err)
            }
          },
        )
        this.setCalibrate()
      })
      .catch((e) => {
        console.log(e)
      })
  }

  calibratePoint(newPoint) {
    let isOld = false
    const newTableCorrect = this.tableCorrect.map((elem) => {
      if (elem.temp == newPoint.temp) {
        isOld = true
        return newPoint
      }
      return elem
    })

    if (!isOld) {
      newTableCorrect.push(newPoint)
    }

    newTableCorrect.sort((el1, el2) => el1.temp - el2.temp)

    this.tableCorrect = newTableCorrect
    this.saveCalibrate()
  }

  calibrateAll() {}
}
