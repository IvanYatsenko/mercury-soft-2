import ModeDisable from './ModeDisable'
import ModeError from './ModeError'
import ModeFinish from './ModeFinish'
import SoundMode from './SoundMode'

class SoundManager {
  constructor() {
    this.soundCallback = () => {}
    this.curMode = new SoundMode()
    this.finishFlag = false
    this.errorFlag = false
  }

  setSoundCallback = (soundCallback) => {
    this.soundCallback = soundCallback
  }

  setMode = (mode) => {
    // console.log('Set sound mode', mode)

    if (this.curMode.getType() === mode) {
      return
    }

    this.curMode.stopMode()

    switch (true) {
      case mode == 'disable':
        this.curMode = new ModeDisable(this)
        break
      case mode == 'finish':
        this.curMode = new ModeFinish(this)
        break
      case mode == 'error':
        this.curMode = new ModeError(this)
        break
      default:
        this.curMode = new SoundMode()
        break
    }
  }

  updateMode = () => {
    // console.log('update mode', this.errorFlag, this.finishFlag)
    if (this.errorFlag) {
      this.setMode('error')
    } else if (this.finishFlag) {
      this.setMode('finish')
    } else {
      this.setMode('disable')
    }
  }

  setFinishFlag = (flag) => {
    console.log('setFinishFlag', flag)

    this.finishFlag = flag
    this.updateMode()
  }

  setErrorFlag = (flag) => {
    // console.log('setErrorFlag', flag)

    this.errorFlag = flag
    this.updateMode()
  }
}

export default SoundManager
