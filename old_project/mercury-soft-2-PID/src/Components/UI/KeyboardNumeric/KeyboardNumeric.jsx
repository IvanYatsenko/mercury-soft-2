import Keyboard from 'react-simple-keyboard'
import 'react-simple-keyboard/build/css/index.css'
import './KeyboardNumeric.css'
import { observer } from 'mobx-react-lite'

export const KeyboardNumeric = observer(({ onKeyPress, isStyle = true }) => {
  const layout = {
    default: ['1 2 3', '4 5 6', '7 8 9', '&#9003; 0 {enter}']
  }

  return (
    <div
      style={
        isStyle ? { position: 'absolute', left: 0, right: 0, bottom: 0 } : {}
      }
    >
      <Keyboard
        display={{
          '{enter}': '&#10003;'
        }}
        baseClass={'keyboard_numeric'}
        onKeyPress={onKeyPress}
        layout={layout}
      />
    </div>
  )
})
