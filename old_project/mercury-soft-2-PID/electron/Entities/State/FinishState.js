import StateInstance from './StateInstance'
import Profile from '../Profile/Profile'

class FinishState extends StateInstance {
  name = 'finish'

  timer = null

  onStart = (board, profileData, timeDelaySec = 1) => {
    const profile = new Profile(profileData)
    const targetTemp = profile.predictTemperature(profile.getLastSecond())

    this.timer = setInterval(async () => {
      const temperature = await this.manager.api.getTemperature()
      const heaters = await this.manager.api.getHeaters()
      const indicators = await this.manager.api.getIndicators()
      const sensors = await this.manager.api.getSensors()

      this.heatersManager.updateHeatersState(heaters)

      this.manager.emit('oven-idle-event', {
        temperature,
        indicators,
        i: { door: sensors.fan220_2 },
        sensors,
      })

      if (this.manager.criticalError) {
        this.heatersManager.setMode('off')
        return
      }

      const currentTemperature = await this.manager.api.getTemperature()
      const realTemp = this.manager.calcTemperature(currentTemperature)

      if (realTemp > targetTemp) {
        this.heatersManager.setMode('cooling', 1)
      } else {
        this.heatersManager.setMode('convection')
      }
    }, timeDelaySec * 1000)
  }

  onEnd = () => {
    clearInterval(this.timer)
  }
}

export default FinishState
