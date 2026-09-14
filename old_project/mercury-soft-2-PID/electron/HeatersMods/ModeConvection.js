import HeatersMode from './HeatersMode'

class ModeConvection extends HeatersMode {
  constructor(commands) {
    super()
    this.commands = commands
    this.period = 1000
    this.active = true

    this.modeLoop()
  }

  getType = () => 'convection'

  stopMode = () => {
    this.active = false
  }

  modeLoop = async () => {
    while (this.active) {
      this.commands.convection().catch((e) => {
        console.log('ModeConvection Error: ', e)
      })
      await this.sleep(this.period)
    }
  }
}

export default ModeConvection
