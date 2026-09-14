import HeatersCommands from './HeatersCommands'
import IRProtector from './IRProtector'

class HeatersCommands300 extends HeatersCommands {
  constructor(manager) {
    super(manager)
    this.IRProtector = new IRProtector(this)
  }

  heat = () => {
    console.log('[M] heat')
    this.IRProtector.abort()
    return this.setHeaters({
      topHeater: true,
      bottomHeater: true,
      infrared: false,
      infrared2: false,
      convection: true,
      f1: false,
      f2: false,
    })
  }

  convection = () => {
    console.log('[M] convection')
    this.IRProtector.abort()
    return this.setHeaters({
      topHeater: false,
      bottomHeater: false,
      infrared: false,
      infrared2: false,
      convection: true,
      f1: false,
      f2: false,
    })
  }

  cooling = () => {
    console.log('[M] cooling')
    this.IRProtector.abort()
    return this.setHeaters({
      topHeater: false,
      bottomHeater: false,
      infrared: false,
      infrared2: false,
      convection: true,
      f1: true,
      f2: true,
    })
  }

  heat_IR = (IR1 = false, IR2 = false) => {
    return this.setHeaters({
      topHeater: true,
      bottomHeater: true,
      infrared: IR1,
      infrared2: IR2,
      convection: true,
      f1: false,
      f2: false,
    })
  }

  heat_IR_protected = (IR1 = false, IR2 = false, IR3 = false) => {
    this.IRProtector.set(IR1, IR2, IR3)
    return
  }

  off = () => {
    console.log('[M] off')
    this.IRProtector.abort()
    return this.setHeaters({
      topHeater: false,
      bottomHeater: false,
      infrared: false,
      infrared2: false,
      convection: false,
      f1: false,
      f2: false,
    })
  }
}

export default HeatersCommands300
