import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  IconButton,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import React, { useState } from 'react'
import { ScheduleProfile } from '../ScheduleProfile/ScheduleProfile'
import EditNoteTwoToneIcon from '@mui/icons-material/EditNoteTwoTone'
import PlayCircleFilledIcon from '@mui/icons-material/PlayCircleFilled'
import styles from './ProfileItem.module.css'
import { WorkModal } from '../WorkModal/WorkModal'
import { ProfileModal } from '../ProfileModal/ProfileModal'
import { observer } from 'mobx-react-lite'

export const ProfileItem = observer(({ profile, ovenStore, setAccordionEnable, setAccordionOpen }) => {
  const { state } = profile
  const [openWorkModal, setOpenWorkModal] = useState(false)
  const [openEditModal, setOpenEditModal] = useState(false)
  return (
    <>
      <Accordion className={styles.profile_item} sx={{ background: 'none' }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{minHeight: '50px!important'}}>
          <div className={styles.name}>
            <span
              style={{
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '200px',
                overflow: 'hidden',
              }}
            >
              <b>{state.name}</b>
            </span>
            <div>
              <IconButton
                style={{ marginRight: '10px', paddingTop: 0, paddingBottom: 0 }}
                aria-label="PlayCircleFilledIcon"
                onClick={(e) => {
                  ovenStore.clearErrorStore()
                  e.stopPropagation()
                  setOpenWorkModal(true)
                  ovenStore.setTesterMode(false)
                  setAccordionOpen(false)
                  setAccordionEnable(true)
                }}
              >
                <PlayCircleFilledIcon
                  sx={{ fontSize: '35px' }}
                  color="success"
                />
              </IconButton>
              <IconButton
                style={{ marginRight: '10px', paddingTop: 0, paddingBottom: 0 }}
                aria-label="EditNoteTwoToneIcon"
                onClick={(e) => {
                  ovenStore.clearErrorStore()
                  e.stopPropagation()
                  setOpenEditModal(true)
                }}
              >
                <EditNoteTwoToneIcon
                  sx={{ fontSize: '35px' }}
                  color="primary"
                />
              </IconButton>
            </div>
          </div>
        </AccordionSummary>
        <AccordionDetails sx={{paddingTop: 0, marginTop: 0, marginBottom: '-50px'}}>
          <ScheduleProfile points={profile.state.points} />
        </AccordionDetails>
      </Accordion>
      {openWorkModal && <WorkModal
        profile={profile}
        openModal={openWorkModal}
        openModalHandler={setOpenWorkModal}
        ovenStore={ovenStore}
      />}
      {openEditModal && (
        <ProfileModal
          openModal={openEditModal}
          openModalHandler={setOpenEditModal}
          profile={profile}
          ovenStore={ovenStore}
        />
      )}
    </>
  )
})
