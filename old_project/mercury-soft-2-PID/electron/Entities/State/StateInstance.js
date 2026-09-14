class StateInstance {
  constructor(manager, heatersManager, onToggleState) {
    this.manager = manager
    this.toggleState = onToggleState
    this.heatersManager = heatersManager
  }

  name = 'undefined'
  onStart = () => {}
  onEnd = () => {}
}

export default StateInstance
