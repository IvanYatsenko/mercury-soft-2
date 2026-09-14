import { Main } from './Components/Main/Main'
import './App.css'
import AppStore from './Store/AppStore'

const appStore = new AppStore()
function App() {
  return <Main ovenStore={appStore.ovenStore} />
}

export default App
