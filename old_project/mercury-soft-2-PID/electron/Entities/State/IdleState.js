import StateInstance from './StateInstance'

class IdleState extends StateInstance {
  name = 'idle'

  timer = null

  lastTemp = 0

  tHeat = 0

  onStart = async (timeDelaySec = 1) => {
    this.timer = setInterval(async () => {
      const temperature = await this.manager.api.getTemperature()
      const stat = await this.manager.api.getStat()
      const heaters = await this.manager.api.getHeaters()
      const indicators = await this.manager.api.getIndicators()
      const sensors = await this.manager.api.getSensors()

      this.heatersManager.updateHeatersState(heaters)

      // console.log('stat', stat)

      this.manager.emit('oven-idle-event', {
        stat,
        temperature,
        indicators,
        i: { door: sensors.fan220_2 },
        sensors,
      })

      if (this.manager.criticalError) {
        this.heatersManager.setMode('off')
        return
      }

      const testerMode = await this.manager.getTesterMode()
      if (testerMode) {
        this.heatersManager.disable()
        return
      }

      const heatKeeping = await this.manager.getKeepingHeat()
      if (sensors.fan220_2 === 0) {
        if (heatKeeping) {
          const currentTemperature = await this.manager.api.getTemperature()
          const realTemp = this.manager.calcTemperature(currentTemperature)

          if (this.manager.thermalProtection) {
            if (realTemp >= 310 || realTemp <= 10) {
              this.manager.setCriticalError()
            }
          } else {
            if (realTemp >= 340 || realTemp <= 10) {
              this.manager.setCriticalError()
            }
          }

          if (this.lastTemp !== 0 && Math.abs(this.lastTemp - realTemp) >= 30) {
            this.manager.setCriticalError()
          }
          this.lastTemp = realTemp

          if (realTemp < 100) {
            this.tHeat += 1
            if (this.tHeat >= 240) {
              this.manager.setCriticalError()
            }
          } else {
            this.tHeat = 0
          }

          this.heatersManager.regulate(realTemp, 100, 0, 100, 100, false)
        } else {
          this.tHeat = 0
          this.lastTemp = 0
          this.heatersManager.setMode('convection')
        }
      } else {
        this.tHeat = 0
        this.lastTemp = 0
        this.heatersManager.setMode('convection')
      }
    }, timeDelaySec * 1000)
  }

  onEnd = () => {
    clearInterval(this.timer)
  }
}

export default IdleState
