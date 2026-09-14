import React, { useState } from 'react'
import Dialog from '@mui/material/Dialog'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import { WifiApsList } from './WifiApsList/WifiApsList'
import { FormControlLabel, FormGroup, Switch } from '@mui/material'
import { observer } from 'mobx-react-lite'

export const WifiModal = observer(
  ({
    open,
    setOpen,
    updateWifiAps,
    listAP,
    statusAP,
    onWifiAp,
    offWifiAp,
    connectHandle,
    disconnectHandle
  }) => {
    const [isLockSwitch, setLockSwitch] = useState(false)

    const handleClose = () => {
      setOpen(false)
    }

    const switchApHandel = () => {
      setLockSwitch(true)
      setTimeout(() => {
        setLockSwitch(false)
      }, 10000)
      if (statusAP) {
        offWifiAp()
      } else {
        onWifiAp()
      }
    }

    return (
      <Dialog color='inherit' fullScreen open={open} onClose={handleClose}>
        <AppBar color='inherit' sx={{ position: 'relative' }}>
          <Toolbar sx={{ justifyContent: 'space-between' }}>
            <Typography sx={{}} variant='span' component='div'>
              <FormGroup>
                <FormControlLabel
                  label={
                    <Typography
                      sx={{ ml: 2, flex: 1 }}
                      variant='h6'
                      component='div'
                    >
                      Настройка WiFi
                    </Typography>
                  }
                  labelPlacement='end'
                  control={
                    <Switch
                      disabled={isLockSwitch}
                      color='success'
                      onChange={switchApHandel}
                      checked={statusAP}
                    />
                  }
                />
              </FormGroup>
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
        {statusAP && !isLockSwitch && (
          <>
            <WifiApsList
              listAP={listAP}
              updateWifiAps={updateWifiAps}
              connectHandle={connectHandle}
              disconnectHandle={disconnectHandle}
            />
          </>
        )}
      </Dialog>
    )
  }
)
