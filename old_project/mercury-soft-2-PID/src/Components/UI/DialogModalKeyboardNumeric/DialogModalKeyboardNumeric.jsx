import React, { useState } from 'react'
import CloseIcon from '@mui/icons-material/Close'
import {
  Typography,
  IconButton,
  Toolbar,
  AppBar,
  List,
  Dialog,
  Input,
  ListItem
} from '@mui/material'
import { KeyboardNumeric } from '../KeyboardNumeric/KeyboardNumeric'
import { observer } from 'mobx-react-lite'

export const DialogModalKeyboardNumeric = observer(
  ({ openModal, openModalHandler, enableHandler, value }) => {
    const [textValue, setTextValue] = useState(String(value))

    const handleClose = () => {
      openModalHandler(false)
    }

    const onKeyPress = (button) => {
      if (button == '&#9003;') {
        setTextValue(textValue.slice(0, -1))
      }
      if (button == '{enter}') {
        // openModalHandler(false)
        enableHandler(Number(textValue))
        // setTextValue('')
      }
      if (button !== '&#9003;' && button !== '&#10003;') {
        const newValue = Number(`${textValue}${button}`)
        setTextValue(`${newValue}`)
      }
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
            <AppBar sx={{ position: 'relative' }} color='transparent'>
              <Toolbar>
                <Typography
                  sx={{ ml: 2, flex: 1 }}
                  variant='h6'
                  component='div'
                >
                  {'Редактирование'}
                </Typography>
                <IconButton
                  edge='start'
                  color='inherit'
                  onClick={handleClose}
                  aria-label='close'
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
                  padding: '12px'
                }}
              >
                <Input
                  color='success'
                  readOnly={true}
                  value={textValue}
                  style={{ width: '100%' }}
                />
                <KeyboardNumeric onKeyPress={onKeyPress} />
              </ListItem>
            </List>
          </Dialog>
        )}
      </>
    )
  }
)
