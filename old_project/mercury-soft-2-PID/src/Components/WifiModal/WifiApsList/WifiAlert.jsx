import React, { useState } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import { Input } from '@mui/material'
import { WifiConnectDialog } from './WifiConnectDialog'
import { observer } from 'mobx-react-lite'

export const WifiAlert = observer(({ open, setOpen, handleClose, ap }) => {
  const [pass, setPass] = useState('')
  const [openDialogPass, setOpenDialogPass] = useState(false)
  const closeDialogPass = (value) => {
    setPass(value)
    setOpenDialogPass(false)
  }
  return (
    <>
      <Dialog
        open={open}
        fullScreen={!ap.status}
        onClose={() => setOpen(false)}
        aria-labelledby='alert-dialog-title'
        aria-describedby='alert-dialog-description'
      >
        <DialogTitle id='alert-dialog-title'>
          {`${ap.status ? 'Отключение' : 'Подключение'}`}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id='alert-dialog-description'>
            {ap.status
              ? `Вы действительно хотите отключиться от точки доступа "${ap.name}"?`
              : `Для подключения к точки доступа "${ap.name}" требуется ввести пароль безопасности:`}
            {!ap.status && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem'
                }}
              >
                Пароль:
                <Input
                  fullWidth
                  value={pass}
                  readOnly
                  color='success'
                  sx={{ mb: 1 }}
                  onClick={() => {
                    setOpenDialogPass(true)
                  }}
                />
              </span>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={ap.status ? {} : { justifyContent: 'flex-start' }}>
          <Button
            disabled={!ap.status && !pass.slice()}
            color={ap.status ? 'warning' : 'success'}
            onClick={() => handleClose({ name: ap.name, pass: pass })}
          >
            {ap.status ? 'Отключиться' : 'Подключиться'}
          </Button>
          <Button color='error' onClick={() => setOpen(false)}>
            Отмена
          </Button>
        </DialogActions>
      </Dialog>
      <WifiConnectDialog
        openModal={openDialogPass}
        openModalHandler={setOpenDialogPass}
        enableHandler={closeDialogPass}
        value={pass}
      />
    </>
  )
})
