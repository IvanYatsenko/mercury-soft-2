import React, { useState } from 'react'
import Keyboard from 'react-simple-keyboard'
import 'react-simple-keyboard/build/css/index.css'
import './KeyboardFull.css'
import { observer } from 'mobx-react-lite'
import { keyboardFullLayout } from './KeyboardFullLayout'

export const KeyboardFull = observer(
  ({ inputValue, setInputValue, onSubmit }) => {
    const [layoutName, setLayoutName] = useState('default')
    const [layoutLang, setLayuotLang] = useState(keyboardFullLayout.layoutRU)

    const onKeyPress = (button) => {
      if (button == '&#10003;' || button == '{enter}') {
        onSubmit(inputValue)
      }
      if (button === '&#8679;') {
        layoutName === 'default'
          ? setLayoutName('shift')
          : setLayoutName('default')
      } else {
        setLayoutName('default')
      }
      if (button == 'EN') {
        setLayuotLang(keyboardFullLayout.layoutEN)
      }
      if (button == 'RU') {
        setLayuotLang(keyboardFullLayout.layoutRU)
      }
      if (button == '&#9003;') {
        setInputValue(inputValue.slice(0, -1))
      }
      if (button == '{space}') {
        setInputValue(`${inputValue} `)
      }
      if (
        button !== 'RU' &&
        button !== 'EN' &&
        button !== '&#8679;' &&
        button !== '&#9003;' &&
        button !== '{space}' &&
        button !== '&#10003;' &&
        button !== '{enter}'
      ) {
        setInputValue(`${inputValue}${button}`)
      }
    }

    return (
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
        <Keyboard
          display={{
            '{enter}': '&#10003;',
            '{space}': ' '
          }}
          baseClass={'keyboard_full'}
          onKeyPress={onKeyPress}
          layout={layoutLang}
          layoutName={layoutName}
        />
      </div>
    )
  }
)
