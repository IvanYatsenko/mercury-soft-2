import * as React from 'react'
import classes from './ProfilesList.module.css'
import { ProfileItem } from '../ProfileItem/ProfileItem'
import { SettingsItem } from '../SettingsItem/SettingsItem'
import { observer } from 'mobx-react-lite'
import { CircularProgress } from '@mui/material'
import { useState } from 'react'

export const ProfilesList = observer(({ profiles = [], ovenStore }) => {
  const [accordionOpen, setAccordionOpen] = useState(false)
  const [accordionEnable, setAccordionEnable] = useState(true)
  return (
    <div className={classes.profiles_list}>
      {ovenStore.profilesStore.isLoading ? (
        <div
          style={{
            position: 'absolute',
            top: '0',
            right: '0',
            bottom: '0',
            left: '0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <CircularProgress color='success' disableShrink />
        </div>
      ) : (
        profiles.map((profile, index) => (
          <ProfileItem
            key={`${profile.state.name}${index}`}
            profile={profile}
            ovenStore={ovenStore}
            setAccordionEnable={setAccordionEnable}
            setAccordionOpen={setAccordionOpen}
          />
        ))
      )}
      <SettingsItem
        ovenStore={ovenStore}
        accordionEnable={accordionEnable}
        setAccordionEnable={setAccordionEnable}
        accordionOpen={accordionOpen}
        setAccordionOpen={setAccordionOpen}
      />
    </div>
  )
})
