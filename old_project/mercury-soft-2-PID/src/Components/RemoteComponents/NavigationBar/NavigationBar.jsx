import {
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  Typography
} from '@mui/material'
import TableRowsIcon from '@mui/icons-material/TableRows'
import SettingsIcon from '@mui/icons-material/Settings'
import CottageIcon from '@mui/icons-material/Cottage'
import React from 'react'
import { observer } from 'mobx-react-lite'

export const NavigationBar = observer(
  ({ activeItem, setActiveItem, disabledSettings }) => {
    return (
      <Paper
        className='NavigationBar'
        sx={{ position: 'fixed', bottom: 0, left: 0, right: 0 }}
        elevation={3}
      >
        <BottomNavigation
          // showLabels
          value={activeItem}
          onChange={(event, newValue) => {
            setActiveItem(newValue)
          }}
        >
          <BottomNavigationAction
            label={
              <Typography component='span' variant='span' color='#2e7d32'>
                Профили
              </Typography>
            }
            icon={<TableRowsIcon color='success' />}
          />
          <BottomNavigationAction
            label={
              <Typography component='span' variant='span' color='#2e7d32'>
                Состояние
              </Typography>
            }
            icon={<CottageIcon color='success' />}
          />
          <BottomNavigationAction
            disabled={disabledSettings}
            label={
              <Typography
                component='span'
                variant='span'
                color={disabledSettings ? 'rgba(0, 0, 0, 0.6)' : '#2e7d32'}
              >
                Настройки
              </Typography>
            }
            icon={
              <SettingsIcon
                sx={{
                  color: disabledSettings
                    ? 'rgba(0, 0, 0, 0.6)!important'
                    : '#2e7d32'
                }}
              />
            }
          />
        </BottomNavigation>
      </Paper>
    )
  }
)
