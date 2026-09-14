import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const Emitter = require('events')

const emitter = new Emitter()

class RouterApi {

    constructor() {
        this.endpoints = {}
    }

    _request(method, path, handler) {

        if (!this.endpoints[path]) {
            this.endpoints[path] = {}
        }
        const endpoint = this.endpoints[path]

        if (endpoint[method]) {
            throw new Error('Error create path to method')
        }

        endpoint[method] = handler
        emitter.on(`[${path}]:[${method}]`, (req, res) => {
            handler(req, res)
        })
    }

    get(path, handler) {
        this._request('GET', path, handler)
    }
}

export const routerApi = new RouterApi()