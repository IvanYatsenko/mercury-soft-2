import { exec } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const fs = require('fs')

export class TimeController {
  constructor() {
    this.checkFlash()
  }

  _flashFlag = false
  count = 0
  oldCount = 0
  dirName = 0
  oldDirName = 0
  interval = null

  removeInterval = () => {
    clearInterval(this.interval)
  }

  startInterval = () => {
    this.interval = setInterval(() => {
      this.count += 60
      this.oldCount += 60
      this.writeLog()
    }, 60000)
  }

  checkFlash = () => {
    exec('lsblk', (err, stdout, stderr) => {
      if (err) {
        console.error(`error checkFlash: ${err.message}`)
        this._flashFlag = false
      }

      if (stderr) {
        console.error(`stderr checkFlash: ${stderr}`)
        this._flashFlag = false
      }

      if (stdout.includes('/media/flash')) {
        this._flashFlag = true
        console.log('TimeController', this._flashFlag)
        if (this._flashFlag) {
          this.createDirName()
        }
      }
    })
  }

  loadCount = () => {
    if (this.oldDirName >= 0) {
      try {
        fs.readFile(`/media/flash/${this.oldDirName}/log.json`, (err, data) => {
          if (!err) {
            if (Number.isInteger(JSON.parse(data).totalTime.oldCount)) {
              this.oldCount = JSON.parse(data).totalTime.oldCount
              console.log(JSON.parse(data))
              this.startInterval()
            } else {
              --this.oldDirName
              this.loadCount()
            }
          } else {
            --this.oldDirName
            this.loadCount()
          }
        })
      } catch (e) {
        console.log(e.message)
        --this.oldDirName
        this.loadCount()
      }
    } else {
      exec('rm -rf /media/flash/*', (error, stdout, stderr) => {
        if (error) {
          console.error(`error: ${error.message}`)
          return
        }

        if (stderr) {
          console.error(`stderr: ${stderr}`)
          return
        }
        this.dirName = 0
        this.oldDirName = 0
        fs.mkdir(`/media/flash/${this.dirName}`, (err) => {
          if (err) {
            console.error(err)
          } else {
            this.startInterval()
          }
        })
      })
    }
  }

  createDirName = () => {
    if (this.dirName < 18250) {
      try {
        fs.stat(`/media/flash/${this.dirName}`, (err) => {
          if (!err) {
            ++this.dirName
            this.oldDirName = this.dirName - 1
            this.createDirName()
          } else if (err.code === 'ENOENT') {
            fs.mkdir(`/media/flash/${this.dirName}`, (err) => {
              if (err) {
                console.error(err)
              } else {
                this.loadCount()
              }
            })
          }
        })
      } catch (e) {
        console.log('createDirName', e)
      }
    }
  }

  startProfile = (profileName, timeAll) => {
    if (this.dirName < 18250 && this._flashFlag) {
      const days = Math.floor(timeAll / (3600 * 24))
      const hours = Math.floor((timeAll / 3600) % 24)
      const minutes = Math.floor((timeAll / 60) % 60)
      const resultData = {
        days: days,
        hours: hours,
        minutes: minutes,
        profileName: profileName
      }
      fs.appendFile(
        `/media/flash/${this.dirName}/logProfile.json`,
        JSON.stringify(resultData),
        (err) => {
          if (err) {
            console.log(err)
          }
        }
      )
    }
  }

  writeLog = () => {
    const days = Math.floor(this.count / (3600 * 24))
    const hours = Math.floor((this.count / 3600) % 24)
    const minutes = Math.floor((this.count / 60) % 60)

    const totalDays = Math.floor(this.oldCount / (3600 * 24))
    const totalHours = Math.floor((this.oldCount / 3600) % 24)
    const totalMinutes = Math.floor((this.oldCount / 60) % 60)
    const resultData = {
      days: days,
      hours: hours,
      minutes: minutes,
      totalTime: {
        totalDays,
        totalHours,
        totalMinutes,
        oldCount: this.oldCount
      }
    }

    fs.writeFile(
      `/media/flash/${this.dirName}/log.json`,
      JSON.stringify(resultData),
      (err) => {
        if (err) {
          console.log(err)
        }
      }
    )
  }
}
