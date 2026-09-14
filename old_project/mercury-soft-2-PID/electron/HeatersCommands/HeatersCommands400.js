import HeatersCommands from './HeatersCommands'
import IRProtector from './IRProtector'

class HeatersCommands400 extends HeatersCommands {
  constructor(manager) {
    super(manager)
    this.IRProtector = new IRProtector(this)
  }

  heat = () => {
    this.IRProtector.abort()
    return this.setHeaters({
      topHeater: true,
      bottomHeater: true,
      infrared: false,
      infrared2: false,
      convection: true,
      f1: false,
      infrared3: false,
    })
  }

  convection = () => {
    this.IRProtector.abort()
    return this.setHeaters({
      topHeater: false,
      bottomHeater: false,
      infrared: false,
      infrared2: false,
      convection: true,
      f1: false,
      infrared3: false,
    })
  }

  cooling = () => {
    // console.log('[M] cooling')
    this.IRProtector.abort()
    return this.setHeaters({
      topHeater: false,
      bottomHeater: false,
      infrared: false,
      infrared2: false,
      convection: true,
      f1: true,
      infrared3: false,
    })
  }

  heat_IR = (IR1 = false, IR2 = false, IR3 = false) => {
    return this.setHeaters({
      topHeater: true,
      bottomHeater: true,
      infrared: IR1,
      infrared2: IR2,
      convection: true,
      f1: false,
      infrared3: IR3,
    })
  }

  heat_IR_protected = (IR1 = false, IR2 = false, IR3 = false) => {
    this.IRProtector.set(IR1, IR2, IR3)
    return
  }

  off = () => {
    this.IRProtector.abort()
    return this.setHeaters({
      topHeater: false,
      bottomHeater: false,
      infrared: false,
      infrared2: false,
      convection: false,
      f1: false,
      infrared3: false,
    })
  }
}

export default HeatersCommands400
