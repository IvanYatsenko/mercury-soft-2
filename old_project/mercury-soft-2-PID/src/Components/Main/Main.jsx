import { observer } from 'mobx-react-lite'
import { MainOvenView } from './MainOvenView/MainOvenView'
import { MainRemoteView } from './MainRemoteView/MainRemoteView'

export const Main = observer(({ ovenStore }) => {
  return (
    window.ipcRenderer ? <MainOvenView ovenStore={ovenStore} /> : <MainRemoteView ovenStore={ovenStore} />
  )
})
