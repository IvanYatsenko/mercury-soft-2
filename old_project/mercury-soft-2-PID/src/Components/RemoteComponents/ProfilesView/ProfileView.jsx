import { Box, Grid, IconButton, Typography } from '@mui/material'
import React, { useEffect, useState } from 'react'
import FileCopyIcon from '@mui/icons-material/FileCopy'
import DeleteIcon from '@mui/icons-material/Delete'
import DownloadIcon from '@mui/icons-material/Download'
import { EditProfileView } from '../EditProfileView/EditProfileView'
import { observer } from 'mobx-react-lite'
import { DialogRemoveProfile } from './DialogRemoveProfile'

export const ProfileView = observer(({ profile, ovenStore }) => {
  const [openModal, setOpenModal] = useState(false)
  const [openRemoveProfileDialog, setOpenRemoveProfileDialog] = useState(false)

  const removeProfileDialog = () => {
    setOpenRemoveProfileDialog(false)
    ovenStore.profilesStore.removeProfile(`${profile.filepath}`)
  }

  const [json, setJSON] = useState(
    JSON.stringify({
      points: profile.state.points,
      shelves: profile.state.shelves,
      mode: profile.state.mode,
      name: profile.state.name,
      board: profile.state.board,
      repeat: 1
    })
  )

  let blob = new Blob([json], { type: 'application/json' })

  useEffect(() => {
    setJSON(
      JSON.stringify({
        points: profile.state.points,
        shelves: profile.state.shelves,
        mode: profile.state.mode,
        name: profile.state.name,
        board: profile.state.board,
        repeat: 1
      })
    )

    blob = new Blob([json], { type: 'application/json' })
  }, [profile, profile.name])

  useEffect(() => {
    if (ovenStore.buzyProfile == profile.filepath) {
      setOpenModal(false)
    }
  }, [ovenStore.buzyProfile])

  const handleClickOpen = () => {
    setOpenModal(true)
  }

  const handleClose = () => {
    setOpenModal(false)
  }
  return (
    <Box
      className={'ProfileItem'}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        mb: 1,
        border: '1px solid rgba(0, 0, 0, .3)',
        borderRadius: '8px',
        background:
          ovenStore.buzyProfile == profile.filepath
            ? 'orange'
            : 'inherit',
        pointerEvents:
          ovenStore.buzyProfile == profile.filepath ? 'none' : 'inherit'
      }}
    >
      <Grid container>
        <Grid item xs={7} sm={9} md={10}>
          <Box
            onClick={handleClickOpen}
            sx={{
              p: 2,
              flex: '1 1 auto'
            }}
          >
            <Typography
              variant='div'
              component='div'
              sx={{
                fontSize: '1rem',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {profile.state.name.toString()}
              {ovenStore.buzyProfile == profile.filepath ? '  в работе' : ''}
            </Typography>
          </Box>
        </Grid>
        <Grid
          item
          xs={5}
          sm={3}
          md={2}
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'end' }}
        >
          <Box
            sx={{ whiteSpace: 'nowrap', minWidth: '120px', textAlign: 'end' }}
          >
            <IconButton
              // variant="outlined"
              color='info'
              onClick={() => {
                const profileData = {
                  board: profile.state.board,
                  mode: profile.state.mode,
                  name: profile.state.name + ' - Копия',
                  points: profile.state.points,
                  repeat: profile.state.repeat,
                  shelves: profile.state.shelves
                }
                ovenStore.profilesStore.createProfile(
                  JSON.stringify(profileData)
                )
              }}
            >
              <FileCopyIcon />
              {/* Копировать профиль */}
            </IconButton>
            <IconButton
              // variant="outlined"
              color='success'
              href={URL.createObjectURL(blob)}
              download={`${profile.state.name}.json`}
            >
              <DownloadIcon />
            </IconButton>
            <IconButton
              // variant="outlined"
              color='error'
              onClick={() => {
                setOpenRemoveProfileDialog(true)
              }}
            >
              <DeleteIcon />
              {/* Копировать профиль */}
            </IconButton>
          </Box>
        </Grid>
      </Grid>
      {openModal && (
        <EditProfileView
          openModal={openModal}
          handleClose={handleClose}
          profile={profile}
          ovenStore={ovenStore}
        />
      )}
      {openRemoveProfileDialog && (
        <DialogRemoveProfile
          onClose={() => setOpenRemoveProfileDialog(false)}
          onSubmit={removeProfileDialog}
          open={openRemoveProfileDialog}
          profileName={profile.state.name}
        />
      )}
    </Box>
  )
})
