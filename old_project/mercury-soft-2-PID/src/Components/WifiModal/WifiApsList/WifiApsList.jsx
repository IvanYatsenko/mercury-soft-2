import React from 'react'
import List from '@mui/material/List'
import { Button, IconButton } from '@mui/material'
import ArrowCircleDownIcon from '@mui/icons-material/ArrowCircleDown'
import ArrowCircleUpIcon from '@mui/icons-material/ArrowCircleUp'
import { observer } from 'mobx-react-lite'
import { WifiApsItem } from './WifiApsItem'

export const WifiApsList = observer(
  ({ listAP, updateWifiAps, connectHandle, disconnectHandle }) => {
    const scrollUp = () =>
      document.getElementById('wifi-list').scrollBy(0, -100)
    const scrollDown = () =>
      document.getElementById('wifi-list').scrollBy(0, 100)

    return (
      <List id='wifi-list' sx={{ overflowY: 'auto' }}>
        <Button color='success' onClick={updateWifiAps}>
          Обновить список доступных сетей
        </Button>
        {listAP.map((ap, i) => {
          return (
            <WifiApsItem
              key={i}
              ap={ap}
              connectHandle={connectHandle}
              disconnectHandle={disconnectHandle}
            />
          )
        })}

        {listAP.length > 3 && (
          <div
            style={{
              position: 'sticky',
              right: '4px',
              bottom: '58px',
              float: 'right',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <IconButton
              sx={{ mr: '1rem', mb: '1rem', padding: 0 }}
              color='success'
              size='large'
              variant='contained'
              onClick={scrollUp}
            >
              <ArrowCircleUpIcon sx={{ fontSize: '40px' }} />
            </IconButton>
            <IconButton
              sx={{ padding: 0, mr: '1rem' }}
              color='success'
              size='large'
              variant='contained'
              onClick={scrollDown}
            >
              <ArrowCircleDownIcon sx={{ fontSize: '40px' }} />
            </IconButton>
          </div>
        )}
      </List>
    )
  }
)
