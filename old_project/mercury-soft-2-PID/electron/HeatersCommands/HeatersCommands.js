class HeatersCommands {
  constructor(manager) {
    this.manager = manager
    this.heatersState = {}
  }

  setHeaters = async (heaters) => {
    if (JSON.stringify(heaters) === JSON.stringify(this.heatersState)) {
      return
    }

    return this.manager.api.setHeaters(heaters).then(() => {
      this.heatersState = heaters
      this.manager.emit('oven-heaters-update', { heaters })
    })
  }

  updateHeatersState = (heaters) => {
    this.heatersState = heaters
    this.manager.emit('oven-heaters-update', { heaters })
  }

  heat = () => {}
  convection = () => {}
  cooling = () => {}
  off = () => {}

  /* eslint-disable */
  heat_IR = (IR1 = false, IR2 = false, IR3 = false) => {}
  heat_IR_protected = (IR1 = false, IR2 = false, IR3 = false) => {}
  /* eslint-enable */
}

export default HeatersCommands
