import { ListItemButton, ListItemText } from '@mui/material'
import React, { useState } from 'react'
import { WifiAlert } from './WifiAlert'
import SignalCellularAltIcon from '@mui/icons-material/SignalCellularAlt'
import SignalCellularAlt2BarIcon from '@mui/icons-material/SignalCellularAlt2Bar'
import SignalCellularAlt1BarIcon from '@mui/icons-material/SignalCellularAlt1Bar'
import { observer } from 'mobx-react-lite'

export const WifiApsItem = observer(
  ({ ap, connectHandle, disconnectHandle }) => {
    const [openAlert, setOpenAlert] = useState(false)
    const showSignal = (signal) => {
      switch (true) {
        case signal > 55:
          return (
            <SignalCellularAltIcon
              color='success'
              sx={{ fontSize: 20, verticalAlign: 'top' }}
            />
          )
        case signal > 30:
          return (
            <SignalCellularAlt2BarIcon
              color='warning'
              sx={{ fontSize: 20, verticalAlign: 'top' }}
            />
          )
        case signal > 15:
          return (
            <SignalCellularAlt1BarIcon
              color='error'
              sx={{ fontSize: 20, verticalAlign: 'top' }}
            />
          )
        default:
          return <></>
      }
    }

    const handleCloseAlert = ({ name, pass }) => {
      if (ap.status) {
        disconnectHandle({ name })
      } else {
        connectHandle({ name, pass })
      }
      setOpenAlert(false)
    }

    return (
      <>
        <ListItemButton onClick={() => setOpenAlert(true)}>
          <ListItemText
            primary={
              <>
                {`${ap.name}`} {showSignal(ap.signal)}
              </>
            }
            secondary={`${ap.status ? 'Подключено' : ''}`}
          />
        </ListItemButton>
        <WifiAlert
          open={openAlert}
          setOpen={setOpenAlert}
          handleClose={handleCloseAlert}
          ap={ap}
        />
      </>
    )
  }
)
