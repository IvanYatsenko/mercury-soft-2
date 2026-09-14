import socketIO from 'socket.io-client'
import OvenStore from './OvenStore'

class AppStore {
  constructor() {
    let connect
    if (window.ipcRenderer) {
      connect = window.ipcRenderer
    } else {
      connect = socketIO.connect(`http://${window.location.hostname}:8085`)
    }
    this.ovenStore = new OvenStore(connect)
  }
}

export default AppStore
