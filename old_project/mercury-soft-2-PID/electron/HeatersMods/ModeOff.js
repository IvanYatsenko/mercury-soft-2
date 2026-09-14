import HeatersMode from './HeatersMode'

class ModeOff extends HeatersMode {
  constructor(commands) {
    super()
    this.commands = commands
    this.period = 1000
    this.active = true

    this.modeLoop()
  }

  getType = () => 'off'

  stopMode = () => {
    this.active = false
  }

  modeLoop = async () => {
    while (this.active) {
      this.commands.off().catch(() => {})
      await this.sleep(this.period)
    }
  }
}

export default ModeOff
