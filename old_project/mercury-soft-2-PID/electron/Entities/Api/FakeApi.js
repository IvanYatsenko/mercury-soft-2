import Api from './Api'

class FakeApi extends Api {
  constructor() {
    super()
  }

  init = async () => {}

  getVersion = () => 2

  getHeaters = () =>
    new Promise((resolve, reject) => {
      reject(123)
    })

  setHeaters = () =>
    new Promise((resolve, reject) => {
      reject(456)
    })

  getIndicators = () =>
    new Promise((resolve, reject) => {
      reject(123)
    })

  setIndicators = () =>
    new Promise((resolve, reject) => {
      reject(789)
    })

  getTemperature = () =>
    new Promise((resolve, reject) => {
      reject(123)
    })

  setStat = (arg) =>
    new Promise((resolve, reject) => {
      reject(arg)
    })

  setPowerOff = (arg) =>
    new Promise((resolve, reject) => {
      reject(arg)
    })

  getSensors = () =>
    new Promise((resolve, reject) => {
      reject(123)
    })
}

export default FakeApi
