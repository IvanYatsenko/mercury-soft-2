class HeatersMode {
  constructor() {}

  getType = () => ''

  setPower = () => 0

  stopMode = () => 0

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

export default HeatersMode
