class IRProtector {
  constructor(commands) {
    this.commands = commands

    this.currentState = {
      IR1: false,
      IR2: false,
      IR3: false,
    }

    this.targetState = {
      IR1: false,
      IR2: false,
      IR3: false,
    }

    this.tDisabled = 0
    this.tEnabled = 0

    this.setLoop()
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  setIter = async () => {
    let needDisable = false
    let nextState = { ...this.currentState }
    for (const [IR, curState] of Object.entries(this.currentState)) {
      let tarState = this.targetState[IR]
      if (curState && !tarState) {
        nextState[IR] = tarState
        needDisable = true
      }
    }

    if (needDisable) {
      await this.commands
        .heat_IR(nextState.IR1, nextState.IR2, nextState.IR3)
        .then(() => {
          this.tDisabled = Date.now()
          this.currentState = nextState
        })
        .catch(() => {})
      return
    }

    let tNow = Date.now()
    if (tNow - this.tDisabled <= 5) {
      return
    }

    if (tNow - this.tEnabled <= 500) {
      return
    }

    for (const [IR, curState] of Object.entries(this.currentState)) {
      let tarState = this.targetState[IR]
      if (!curState && tarState) {
        nextState[IR] = tarState
        await this.commands
          .heat_IR(nextState.IR1, nextState.IR2, nextState.IR3)
          .then(() => {
            this.tEnabled = Date.now()
            this.currentState = nextState
          })
          .catch(() => {})
        return
      }
    }
  }

  setLoop = async () => {
    /* eslint-disable */
    while (true) {
      await this.setIter()
      await this.sleep(10)
    }
    /* eslint-enable */
  }

  set = (IR1 = false, IR2 = false, IR3 = false) => {
    this.targetState = {
      IR1: IR1,
      IR2: IR2,
      IR3: IR3,
    }
  }

  abort = () => {
    this.currentState = {
      IR1: false,
      IR2: false,
      IR3: false,
    }

    this.targetState = {
      IR1: false,
      IR2: false,
      IR3: false,
    }
  }
}

export default IRProtector
