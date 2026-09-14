import HeatersMode from './HeatersMode'

class ModeLight300 extends HeatersMode {
  constructor(commands, power) {
    super()
    this.commands = commands
    this.period = 1000
    this.power = 1
    this.active = true

    this.setPower(power)
    this.modeLoop()
  }

  getType = () => 'light'

  setPower = (power) => {
    power = Math.min(1, Math.max(power, 0))
    power = Math.min(power, 0.5)

    this.power = power
  }

  stopMode = () => {
    this.active = false
  }

  modeLoop = async () => {
    // power 0.25:
    //   |---         |         ---| - IR1
    //   |         ---|---         | - IR2
    //   |            |            |

    // power 0.75:
    //   |---------   |   ---------| - IR1
    //   |   ---------|---------   | - IR2
    //   |            |            |
    //

    let sections = 2

    let dtArr = [0, this.period]
    let IRKeyArr = ['IR1', 'IR2']

    let IRState = {
      IR1: false,
      IR2: false,
    }

    while (this.active) {
      let TOn = this.period * sections * this.power

      let t = Date.now() % (this.period * sections)

      for (let i = 0; i < sections; i++) {
        let dt = dtArr[i]
        let IRKey = IRKeyArr[i]

        let tCentered = t - dt
        if (tCentered > this.period * (sections / 2)) {
          tCentered -= sections * this.period
        }
        IRState[IRKey] = Math.abs(tCentered) < TOn / 2
      }

      this.commands.heat_IR_protected(IRState.IR1, IRState.IR2)

      await this.sleep(10)
    }
  }
}

export default ModeLight300
