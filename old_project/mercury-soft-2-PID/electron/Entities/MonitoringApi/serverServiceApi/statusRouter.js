import { routerApi } from "./RouterApi"

routerApi.get('/status', (request, response) => {

    // eslint-disable-next-line no-undef
    const data = global.ovenManager.monitoringStatus

    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify(data))
})

export const statusRouter = routerApi