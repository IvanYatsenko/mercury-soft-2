class SoundMode {
  constructor() {}

  getType = () => ''

  stopMode = () => {}

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

export default SoundMode
