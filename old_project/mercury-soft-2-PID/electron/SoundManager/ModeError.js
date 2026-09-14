import SoundMode from './SoundMode'

class ModeError extends SoundMode {
  constructor(soundManager) {
    super()
    this.soundManager = soundManager
    this.active = true

    this.modeLoop()
  }

  getType = () => 'error'

  stopMode = () => {
    this.active = false
  }

  modeLoop = async () => {
    while (this.active) {
      this.active && this.soundManager.soundCallback(true)
      await this.sleep(500)
      this.active && this.soundManager.soundCallback(false)
      await this.sleep(500)
    }
  }
}

export default ModeError
