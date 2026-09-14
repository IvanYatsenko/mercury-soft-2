import SoundMode from './SoundMode'

class ModeDisable extends SoundMode {
  constructor(soundManager) {
    super()
    this.soundManager = soundManager
    this.active = true

    this.modeLoop()
  }

  getType = () => 'disable'

  stopMode = () => {
    this.active = false
  }

  modeLoop = async () => {
    while (this.active) {
      this.soundManager.soundCallback(false)
      await this.sleep(1000)
    }
  }
}

export default ModeDisable
