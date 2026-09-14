// const http = require('http')
import { EventEmitter } from 'node:events'
import * as http from 'node:http'

class ServerService {
  constructor() {
    this.emitter = new EventEmitter()
    this.server = this._createServer()
  }

  addRouter(router) {
    Object.keys(router.endpoints).forEach((path) => {
      const endpoint = router.endpoints[path]
      Object.keys(endpoint).forEach((method) => {
        const handler = endpoint[method]
        this.emitter.on(
          this._getRouteMask(path, method),
          (request, response) => {
            handler(request, response)
          }
        )
      })
    })
  }

  listen(port, callBack) {
    this.server.listen(port, callBack)
  }

  _createServer() {
    return http.createServer((request, response) => {
      const emitted = this.emitter.emit(
        this._getRouteMask(request.url, request.method),
        request,
        response
      )
      if (emitted) {
        response.end('ServerService')
      }
    })
  }

  _getRouteMask(path, method) {
    return `[${path}]:[${method}]`
  }
}

export const serverService = new ServerService()
