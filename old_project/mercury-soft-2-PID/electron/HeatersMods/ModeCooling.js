import HeatersMode from './HeatersMode'

class ModeCooling extends HeatersMode {
  constructor(commands, power) {
    super()
    this.commands = commands
    this.period = 1000
    this.power = 1
    this.active = true

    this.setPower(power)
    this.modeLoop()
  }

  getType = () => 'cooling'

  setPower = (power) => {
    this.power = Math.min(1, Math.max(power, 0))
  }

  stopMode = () => {
    this.active = false
  }

  modeLoop = async () => {
    while (this.active) {
      if (this.power > 0) {
        this.commands.cooling().catch(() => {})
      }
      await this.sleep(this.power * this.period)
      if (this.power < 1 && this.active) {
        this.commands.convection().catch(() => {})
      }
      await this.sleep(this.period - this.power * this.period)
    }
  }
}

export default ModeCooling
