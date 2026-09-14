import { Monitoring } from './Monitoring'
import { RestIpcRender } from './RestIpcRender'
import { RestSocet } from './RestSocet'
import EventEmitter from 'node:events'

export class RestOven {
  constructor(ovenStore, RENDERER_DIST, webContents) {
    const emmiter = new EventEmitter()
    this.restIpcRender = new RestIpcRender(ovenStore, emmiter, webContents)
    this.restMonitoring = new Monitoring(ovenStore.ovenManager)
    this.interval = setInterval(() => {
      if (ovenStore.ip) {
        this.restSocet = new RestSocet(ovenStore, RENDERER_DIST, emmiter)
        clearInterval(this.interval)
      }
    }, 2000)
  }
}
