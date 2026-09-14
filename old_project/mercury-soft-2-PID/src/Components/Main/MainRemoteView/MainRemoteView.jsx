import { CssBaseline, Grid } from '@mui/material'
import React, { useState } from 'react'
import { HeaderView } from '../../RemoteComponents/HeaderView/HeaderView'
import { StatusView } from '../../RemoteComponents/StatusView/StatusView'
import { SettingsView } from '../../RemoteComponents/SettingsView/SettingsView'
import { ProfilesView } from '../../RemoteComponents/ProfilesView/ProfilesView'
import { observer } from 'mobx-react-lite'
import { NavigationBar } from '../../RemoteComponents/NavigationBar/NavigationBar'

export const MainRemoteView = observer(({ ovenStore }) => {
  const [activeItem, setActiveItem] = useState(1)
  return (
    <div style={{ position: 'relative' }}>
      <HeaderView version={ovenStore.version} />
      <CssBaseline />
      <ProfilesView isActive={activeItem == 0} ovenStore={ovenStore} />
      <Grid container className='MainRemoteView'>
        <StatusView
          closeProgressPage={ovenStore.closeProgressPage}
          // debugMode = false,
          points={ovenStore.profileData.state?.points}
          isBoardTemp={ovenStore.profileData.state?.board}
          progress={ovenStore.progress}
          isActive={activeItem == 1}
          status={ovenStore.state}
          ovenTemp={ovenStore.temperature}
          ovenFanSpeed={ovenStore.convFreqSpeed}
          timeHorizon={ovenStore.timeHorizon}
          errors={ovenStore.errorStore}
          profileName={ovenStore.profileName}
        />
        <SettingsView
          disabled={ovenStore.state != 'idle'}
          isActive={activeItem == 2}
          ovenStore={ovenStore}
          thermalProtection={ovenStore.thermalProtection}
          thermocoupleCorrection={ovenStore.thermocoupleCorrection}
          fanTarget={ovenStore.fanTarget}
        />
        <NavigationBar
          disabledSettings={ovenStore.state != 'idle'}
          activeItem={activeItem}
          setActiveItem={setActiveItem}
        />
      </Grid>
    </div>
  )
})
