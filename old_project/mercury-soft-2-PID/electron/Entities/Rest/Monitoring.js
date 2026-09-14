import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const express = require('express')

export class Monitoring {
  constructor(ovenManager) {
    const app = express()
    app.get('/status', (request, response) =>
      response.send(ovenManager.monitoringStatus)
    )
    app.listen(3457)
  }
}
