import HeatersMode from './HeatersMode'

class ModeLight400 extends HeatersMode {
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
    power = Math.min(power, 0.666)

    this.power = power
  }

  stopMode = () => {
    this.active = false
  }

  modeLoop = async () => {
    // power 0.16666:
    //   |---         |            |         ---| - IR1
    //   |         ---|---         |            | - IR2
    //   |            |         ---|---         | - IR3

    // power 0.3333:
    //   |------      |            |      ------| - IR1
    //   |      ------|------      |            | - IR2
    //   |            |      ------|------      | - IR3

    // power 0.5:
    //   |---------   |            |   ---------| - IR1
    //   |   ---------|---------   |            | - IR2
    //   |            |   ---------|---------   | - IR3

    // power 0.666:
    //   |------------|            |------------| - IR1
    //   |------------|------------|            | - IR2
    //   |            |------------|------------| - IR3

    // power 0.8333:
    //   |------------|---      ---|------------| - IR1
    //   |------------|------------|---      ---| - IR2
    //   |---      ---|------------|------------| - IR3

    let sections = 3

    let dtArr = [0, this.period, 2 * this.period]
    let IRKeyArr = ['IR1', 'IR2', 'IR3']

    let IRState = {
      IR1: false,
      IR2: false,
      IR3: false,
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

      this.commands.heat_IR_protected(IRState.IR1, IRState.IR2, IRState.IR3)

      await this.sleep(10)
    }
  }
}

export default ModeLight400
