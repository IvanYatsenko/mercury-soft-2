// import { createRequire } from 'module'
import { serverService } from './serverServiceApi/serverService'
// import { statusRouter } from './serverServiceApi/statusRouter'
import { propertiesRouter } from './serverServiceApi/propertiesRouter'
// const require = createRequire(import.meta.url)

// const serverService = require('./serverServiceApi/serverService')
// const propertiesRouter = require('./serverServiceApi/propertiesRouter')
// const statusRouter = require('./serverServiceApi/statusRouter')

export const MonitoringApi = () => {

    const PORT = 3457


    
    // serverService.addRouter(propertiesRouter)
    // serverService.addRouter(statusRouter)

    // serverService.listen(PORT, () => { })

  // } else if (req.url === '/status') {
  //   const status = ovenManager.getMonitoringStatus()
  //   res.end(JSON.stringify(status))

}
