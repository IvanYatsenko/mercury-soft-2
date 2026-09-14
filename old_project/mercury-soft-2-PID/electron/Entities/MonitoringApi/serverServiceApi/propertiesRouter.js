import { createRequire } from 'module'
import { routerApi } from './RouterApi'
const require = createRequire(import.meta.url)

// const routerApi = require('./RouterApi')
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

const userDataPath = app.getPath('userData')

fs.readFile(path.join(userDataPath, 'config.json'), { encoding: "utf-8" }, (err, data) => {

    if (err) {
        throw new Error(err.message)
    }

    routerApi.get('/properties', (request, response) => {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        response.end(data)
    })

})


export const propertiesRouter = routerApi