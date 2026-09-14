import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Typography
} from '@mui/material'
import React from 'react'

export const DialogRemoveProfile = ({
  open,
  onClose,
  onSubmit,
  profileName
}) => {
  return (
    <Dialog
      open={open}
      aria-labelledby='alert-dialog-title'
      aria-describedby='alert-dialog-description'
    >
      <DialogTitle id='alert-dialog-title'>{'Удаление'}</DialogTitle>
      <DialogContent>
        <DialogContentText id='alert-dialog-description'>
          <Typography variant='span' component={'span'}>
            {`Удалить: ${profileName}?`}
            <br />
            <br />
          </Typography>
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button color='success' onClick={onClose}>
          Отмена
        </Button>
        <Button color='error' onClick={onSubmit}>
          Удалить
        </Button>
      </DialogActions>
    </Dialog>
  )
}
