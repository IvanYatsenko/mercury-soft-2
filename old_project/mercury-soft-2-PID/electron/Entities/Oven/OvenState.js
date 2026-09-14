import BusyState from '../State/BusyState'
import FinishState from '../State/FinishState'
import IdleState from '../State/IdleState'
import HeatersManager from './HeatersManager'

class OvenState {
  constructor(manager, mercuryType) {
    this.manager = manager
    this.heatersManager = new HeatersManager(manager, mercuryType)
    this.current = new IdleState(manager, this.heatersManager, this.toggleState)
    this.current.onStart()
  }

  statesMap = {
    idle: IdleState,
    busy: BusyState,
    finish: FinishState,
  }

  toggleState = (stateName) => {
    this.current.onEnd()

    if (stateName in this.statesMap) {
      const NextState = this.statesMap[stateName]
      this.current = new NextState(
        this.manager,
        this.heatersManager,
        this.toggleState,
      )
      this.manager.emit('oven-state-changed', stateName)
    }

    return this.current
  }
}

export default OvenState
