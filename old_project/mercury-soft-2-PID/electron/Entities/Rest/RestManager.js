export class RestManager {
  constructor(){}

  values = {
    coreTemp: 'coreTemp',
    timeHorizon: 'timeHorizon',
    temperature: 'temperature',
    convFreq: 'convFreq', // { "Hz": 0, "rel": 0 }
    convFreqSpeed: 'convFreqSpeed',
    second: 'second',
    i: 'i',
    sensors: 'sensors',
    progress: 'progress',
    profileName: 'profileName',
    profileData: 'profileData',
    data: 'data', // { indicators: [] }
    error: 'error',
    heat: 'heat',
    timerId: 'timerId',
    board: 'board',
    repeat: 'repeat',
    coreFanCounter: 'coreFanCounter',
    boardFanCounter: 'boardFanCounter',
    fanError: 'fanError', //{ core: false, board: false },
    heaters: 'heaters', //{ topHeater: false, bottomHeater: false, convection: false, infrared: false, infrared2: false, infrared3: false, f2: false, f1: false },
    heatIndicators: 'heatIndicators', //{tens: 0, IR: 0, convection: 0,fans: 0 },
    indicators: 'indicators', //{i1: false, i2: false, i3: false, i4: false, i5: false, i6: false, i7: false, i8: false},
    timeoutIds: 'timeoutIds', //{i1: undefined, i2: undefined, i3: undefined, i4: undefined, i5: undefined,     i6: undefined,      i7: undefined,      i8: undefined    },
    errorStore: 'errorStore', //{ profileError: 0, fanError: 0,     doorError: 0,   ovenTempError: 0,  itmpError: 0 },
    timers: 'timers',
    criticalError: 'criticalError',
    isErrorFunModal: 'isErrorFunModal',
  }

}