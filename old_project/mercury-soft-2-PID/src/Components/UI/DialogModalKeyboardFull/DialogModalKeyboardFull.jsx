import React, { useState } from 'react'
import CloseIcon from '@mui/icons-material/Close'
import { KeyboardFull } from './../KeyboardFull/KeyboardFull'
import {
  Typography,
  IconButton,
  Toolbar,
  AppBar,
  List,
  Dialog,
  Input,
  ListItem,
} from '@mui/material'
import { observer } from 'mobx-react-lite'
// import { keyboardFullLayout } from '../KeyboardFull/KeyboardFullLayout'

export const DialogModalKeyboardFull = observer(
  ({ openModal, openModalHandler, enableHandler, value }) => {
    const [inputValue, setInputValue] = useState(value)
    // const keyboard = useRef()
    // const [textValue, setTextValue] = useState(value)
    // const [layoutName, setLayoutName] = useState('default')
    // const [layoutLang, setLayuotLang] = useState(keyboardFullLayout.layoutRU)

    const handleClose = () => {
      openModalHandler(false)
    }

    return (
      <>
        {openModal && (
          <Dialog
            fullScreen
            open={openModal}
            onClose={handleClose}
            onClick={(e) => e.stopPropagation()}
          >
            <AppBar sx={{ position: 'relative' }} color="transparent">
              <Toolbar>
                <Typography
                  sx={{ ml: 2, flex: 1 }}
                  variant="h6"
                  component="div"
                >
                  {`Редактирование - ${value}`}
                </Typography>
                <IconButton
                  edge="start"
                  color="inherit"
                  onClick={handleClose}
                  aria-label="close"
                >
                  <CloseIcon />
                </IconButton>
              </Toolbar>
            </AppBar>
            <List>
              <ListItem
                style={{
                  height: '80vh',
                  alignItems: 'baseline',
                  padding: '12px',
                }}
              >
                <Input
                  color="success"
                  readOnly={true}
                  value={inputValue}
                  style={{ width: '100%' }}
                />
                <KeyboardFull
                  inputValue={inputValue}
                  setInputValue={setInputValue}
                  onSubmit={enableHandler}
                  // keyboardRef={keyboard}
                  // onKeyPress={onKeyPress}
                  // layoutLang={layoutLang}
                  // layoutName={layoutName}
                />
              </ListItem>
            </List>
          </Dialog>
        )}
      </>
    )
  }
)
