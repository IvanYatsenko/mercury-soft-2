import { createRequire } from 'module'
import StateInstance from './StateInstance'
import Profile from '../Profile/Profile'

class BusyState extends StateInstance {
  name = 'busy'

  profile = null

  timeDelaySec = null

  history = []

  currentSecond = 0

  state = true

  error = false

  IE = 0

  infraredCount = 0

  board = false

  doorState = false

  lastTemp = 0

  saveHistory = () => {
    let data = []

    this.history.forEach((item) => {
      let s = item.second
      let realTemp = this.manager.calcTemperature(item.temperature, this.board)
      data.push({ second: s, temp: realTemp })
    })

    let jsonData = JSON.stringify({ data: data })
    const require = createRequire(import.meta.url)
    const fs = require('node:fs')
    fs.writeFile('history.json', jsonData, function (err) {
      if (err) {
        console.log(err)
      }
    })
  }

  onStart = (board, profileData, timeDelaySec = 1) => {
    this.manager.emit('oven-store-deviation', 0)
    this.profileData = profileData
    this.profile = new Profile(profileData)

    this.board = board
    this.timeDelaySec = timeDelaySec
    this.history = []
    this.currentSecond = 0
    return this.work()
  }

  work = async () => {
    const realTemperature = await this.manager.api.getTemperature()
    const startTemperature = this.manager.calcTemperature(
      realTemperature,
      this.board
    )
    const startSecond = this.profile.predictSecond(startTemperature)
    const endSecond = this.profile.getLastSecond()

    const initSensors = await this.manager.api.getSensors()
    this.doorState = initSensors.fan220_2

    this.currentSecond = startSecond
    if(this.timer) {
      clearInterval(this.timer)
    }
    this.timer = setInterval(async () => {
      if (this.manager.criticalError) {
        this.heatersManager.setMode('off')
        this.toggleState('finish').onStart(this.board, this.profileData)
        return
      }
      // let startTime = performance.now()

      const currentTemperature = await this.manager.api.getTemperature()
      const heaters = await this.manager.api.getHeaters()

      const sensors = await this.manager.api.getSensors()
      const timeHorizon = endSecond - this.currentSecond

      this.heatersManager.updateHeatersState(heaters)

      if (this.doorState !== sensors.fan220_2) {
        // если состояние двери изменилось
        this.doorState = sensors.fan220_2
        if (this.doorState) {
          // если дверь открылась
          this.heatersManager.setMode('convection')
          this.manager.emit('oven-store-error', 'doorError')
        } else {
          // если дверь закрылась
          // const realTemp = this.manager.calcTemperature(
          //   currentTemperature,
          //   this.board,
          // )
          // const second = this.profile.calcSecond(realTemp, this.currentSecond)
          // this.currentSecond = second
        }
      }

      if (this.doorState) {
        // если дверь открыта
        this.heatersManager.setMode('convection')
        this.history.push({
          temperature: currentTemperature,
          second: this.currentSecond,
          heaters,
          i: { door: sensors.fan220_2 },
          error: true,
          timeHorizon
        })
        this.manager.emit('oven-progress', this.history)
      } else {
        this.history.push({
          temperature: currentTemperature,
          second: this.currentSecond,
          heaters,
          i: { door: sensors.fan220_2 },
          error: this.error,
          timeHorizon
        })
        this.manager.emit('oven-progress', this.history)

        this.currentSecond += this.timeDelaySec

        if (this.currentSecond < endSecond) {
          const nextTemperature = this.profile.predictTemperature(
            this.currentSecond
          )
          const realTemp = this.manager.calcTemperature(
            currentTemperature,
            this.board
          )
          this.manager.emit('oven-store-deviation', realTemp - nextTemperature)
          
          if (this.manager.thermalProtection) {
            if (realTemp >= 310 || realTemp <= 10) {
              this.manager.setCriticalError()
              this.heatersManager.setMode('off')
              this.error = true
              this.manager.emit('oven-store-error', 'ovenTempError')
            }
          } else {
            if (realTemp >= 340 || realTemp <= 10) {
              this.manager.setCriticalError()
              this.heatersManager.setMode('off')
              this.error = true
              this.manager.emit('oven-store-error', 'ovenTempError')
            }
          }

          if (this.lastTemp !== 0 && Math.abs(this.lastTemp - realTemp) >= 30) {
            this.manager.setCriticalError()
          }
          this.lastTemp = realTemp

          const curCheckpoint = this.profile.getPosition(this.currentSecond)
          const prevCheckpoint = this.profile.getPrevPosition(
            this.currentSecond
          )
          const nextCheckpoint = this.profile.getNextPosition(
            this.currentSecond
          )

          const period = curCheckpoint.second - prevCheckpoint.second
          const periodNext = nextCheckpoint.second - curCheckpoint.second

          const targetSpeed =
            (curCheckpoint.temperature - prevCheckpoint.temperature) / period
          let nextTargetSpeed = targetSpeed
          if (periodNext > 1e-5) {
            nextTargetSpeed =
              (nextCheckpoint.temperature - curCheckpoint.temperature) /
              periodNext
          }
          if (realTemp > 305 && this.manager.thermalProtection) {
            this.heatersManager.setMode('off')
            this.error = true
            this.manager.emit('oven-store-error', 'ovenTempError')
          } else if (realTemp > 335 && !this.manager.thermalProtection) {
            this.heatersManager.setMode('off')
            this.error = true
            this.manager.emit('oven-store-error', 'ovenTempError')
          } else {
            this.heatersManager.regulate(
              realTemp,
              nextTemperature,
              targetSpeed,
              nextTargetSpeed,
              curCheckpoint.second - this.currentSecond
            )

            const globalError = curCheckpoint.temperature - realTemp
            const localError = nextTemperature - realTemp
            const mode = this.heatersManager.getMode()

            this.error = this.defineError(localError, globalError, mode)
            if (this.error) {
              this.manager.emit('oven-store-error', 'profileError')
            }
          }
        } else {
          this.heatersManager.setMode('convection')
          this.toggleState('finish').onStart(this.board, this.profileData)
        }
      }
      // let endTime = performance.now()
      // console.log(`full iter took ${endTime - startTime} milliseconds`)
    }, this.timeDelaySec * 1000)
  }

  onEnd = () => {
    // this.saveHistory()
    this.manager.emit('oven-store-deviation', 0)
    if (!this.manager.criticalError) {
      this.heatersManager.setMode('convection')
    }
    this.profile = null
    this.history = []
    this.timeDelaySec = null
    this.currentSecond = 0
    clearInterval(this.timer)
  }

  defineError = (tempError, globalError, mode) => {
    const action = this.defineAction(mode)
    if (tempError > -15 && tempError < 15) {
      // Если находимся в пределах 15 градусов от целевой температуры - все норм
      this.IE = 0
      return false
    }

    if (this.IE > 20) {
      this.manager.setCriticalError()
      this.heatersManager.setMode('off')
      this.error = true
      this.manager.emit('oven-store-error', 'ovenTempError')
      return true
    }

    // Если долго находимся за пределами 20 градусов, ошибка
    if (this.IE > 10) {
      this.IE += 1
      return true
    }

    // Смотрим а почему мы за 20 градусов вышли
    switch (true) {
      case tempError < 0 && action < 0 && globalError < 0:
        // если должно быть ниже и охлаждается,
        // следующий ниже - накапливать? - значит плохо остывает
        // this.IE = this.IE + 1
        return false

      case tempError > 0 && action > 0 && globalError > 0:
        // если должно быть выше и нагревается,
        // следующее выше - накапливать? - значит медленно нагревается
        this.IE += 1
        return false

      case tempError < 0 && action > 0 && globalError < 0:
        // если должно быть ниже и нагревается, следующий ниже- ошибка - делает не то
        this.IE += 1
        return true

      case tempError > 0 && action < 0 && globalError > 0:
        // если должно быть выше и охлаждается, следующий выше - ошибка - делает не то
        // this.IE += 1
        return true

      default: // Во всех остальных случаях мы просто чуть-чуть переборщили и уже выравниваемся, все ок
        return false
    }
  }

  defineAction = (mode) => {
    if (mode == 'bothHeaters' || mode == 'light') {
      // TODO если bothHeaters проверять что при этом power не 0 потому что это конвекция по сути
      return 1 // Нагревается
    }

    if (mode == 'cooling') {
      return -1 // Остужается
    }
    return 0
  }
}

export default BusyState
