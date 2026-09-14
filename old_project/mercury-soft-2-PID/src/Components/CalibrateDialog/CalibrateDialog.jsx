import {
  AppBar,
  Box,
  Dialog,
  IconButton,
  Tab,
  Tabs,
  Toolbar
} from '@mui/material'
import React, { useState } from 'react'
import CloseIcon from '@mui/icons-material/Close'
import { PartialTab } from './CalibrateTabs/PartialTab'
import { FullTab } from './CalibrateTabs/FullTab'
import { TableTab } from './CalibrateTabs/TableTab'
import { observer } from 'mobx-react-lite'

export const CalibrateDialog = observer(
  ({ openModalCalib, openModalCalibHandler, ovenStore, showFullSettings }) => {
    const [activeTab, setActiveTab] = useState(0)

    const [disabledBtns, setDisabledBtns] = useState(false)

    const changeTab = (event, newValue) => {
      setActiveTab(newValue)
    }
    return (
      <Dialog fullScreen open={openModalCalib} onClose={openModalCalibHandler}>
        <AppBar sx={{ position: 'relative' }} color='transparent'>
          <Toolbar>
            <Box sx={{ flex: 1 }}>
              <Tabs
                textColor='inherit'
                indicatorColor='inherit'
                onChange={changeTab}
                value={activeTab}
                aria-label='lab API tabs example'
              >
                <Tab
                  sx={{ color: '#2e7d32', borderColor: '#2e7d32' }}
                  disabled={disabledBtns}
                  label='Частичная'
                  value={0}
                />
                {showFullSettings && (
                  <Tab
                    disabled={disabledBtns}
                    sx={{ color: '#2e7d32' }}
                    label='Полная'
                    value={1}
                  />
                )}
                <Tab
                  disabled={disabledBtns}
                  sx={{ color: '#2e7d32' }}
                  label='Таблица'
                  value={2}
                />
              </Tabs>
            </Box>
            <IconButton
              sx={{ display: disabledBtns ? 'none' : 'inline-flex' }}
              edge='start'
              color='inherit'
              onClick={openModalCalibHandler}
              aria-label='close'
            >
              <CloseIcon />
            </IconButton>
          </Toolbar>
        </AppBar>
        <Box
          sx={{ width: '100%', typography: 'body1', overflowY: 'auto' }}
          id='calibrate-table'
        >
          {activeTab == 0 && (
            <PartialTab
              disabledBtns={disabledBtns}
              ovenStore={ovenStore}
              setDisabledBtns={setDisabledBtns}
            />
          )}
          {activeTab == 1 && (
            <FullTab
              disabledBtns={disabledBtns}
              ovenStore={ovenStore}
              setDisabledBtns={setDisabledBtns}
            />
          )}{' '}
          {activeTab == 2 && (
            <TableTab
              showFullSettings={showFullSettings}
              ovenStore={ovenStore}
            />
          )}
        </Box>
      </Dialog>
    )
  }
)
