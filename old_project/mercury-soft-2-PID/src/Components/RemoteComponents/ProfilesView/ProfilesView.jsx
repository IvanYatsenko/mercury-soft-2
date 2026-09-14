import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  Typography
} from '@mui/material'
import React, { useState } from 'react'
import { styled } from '@mui/material/styles'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import AddCircleIcon from '@mui/icons-material/AddCircle'
import { ProfileView } from './ProfileView'
import { observer } from 'mobx-react-lite'
import { CreateProfileDialog } from '../../CreateProfileDialog/CreateProfileDialog'
import { LayoutProfile } from '../../../Constants/LayoutProfile'

export const ProfilesView = observer(({ isActive, ovenStore }) => {
  const [openCreateProfileDialog, setOpenCreateProfileDialog] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [openAlert, setOpenAlert] = useState(false)
  const [profileData, setDataProfile] = useState({})

  const setOpenEditModalHaldler = (value) => {
    const layout = LayoutProfile[value]
    ovenStore.profilesStore.createProfile(
      JSON.stringify({
        points: layout.points,
        shelves: layout.shelves,
        mode: 'manual',
        name: layout.name,
        board: false,
        repeat: 1
      })
    )
    setOpenCreateProfileDialog(false)
  }

  const VisuallyHiddenInput = styled('input')({
    clip: 'rect(0 0 0 0)',
    clipPath: 'inset(50%)',
    height: 1,
    overflow: 'hidden',
    position: 'absolute',
    bottom: 0,
    left: 0,
    whiteSpace: 'nowrap',
    width: 1
  })

  return (
    <Grid
      className={
        isActive ? 'ProfilesView ProfilesView--active' : 'ProfilesView'
      }
      item
      xs={12}
      sx={{ mt: 1 }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Typography color='#2e7d32' variant='h6' component='div' sx={{ ml: 1 }}>
          Профили
        </Typography>
        <Box className='prifiles-head-btns'>
          <Button
            component='label'
            variant='text'
            tabIndex={-1}
            onChange={(e) => {
              const uploadedFile = e.target.files[0]

              if (uploadedFile) {
                const readFile = new FileReader()
                readFile.onload = function (e) {
                  const contents = e.target.result
                  const json = JSON.parse(contents)
                  setProfileName(json.name)
                  setDataProfile({
                    points: json.points,
                    shelves: json.shelves,
                    mode: 'manual',
                    name: json.name,
                    board: false,
                    repeat: 1
                  })
                  setOpenAlert(true)
                }
                readFile.readAsText(uploadedFile)
              }
            }}
            // variant="outlined"
            color='info'
            sx={{
              marginRight: '10px!important',
              paddingRight: '0px!important',
              width: '50px',
              minWidth: '50px'
            }}
            startIcon={<UploadFileIcon sx={{ fontSize: '25px!important' }} />}
          >
            <VisuallyHiddenInput type='file' />
          </Button>
          <Button
            variant='text'
            color='success'
            sx={{ mr: 1, pl: 1, pr: 1, width: '50px', minWidth: '50px' }}
            startIcon={<AddCircleIcon sx={{ fontSize: '25px!important' }} />}
            onClick={() => {
              setOpenCreateProfileDialog(true)
            }}
          ></Button>
        </Box>
      </Box>
      <Divider sx={{ pb: 1 }} />
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
        <Box sx={{ m: 1 }}>
          {ovenStore.profilesStore.profiles.map((profile, index) => (
            <ProfileView
              profile={profile}
              key={`${profile.state.name}${index}`}
              ovenStore={ovenStore}
            />
          ))}
        </Box>
      )}
      <Divider />
      <div
        className='prifiles-btns'
        style={{
          alignItems: 'center',
          justifyContent: 'space-around',
          marginTop: '1rem'
        }}
      >
        <Button
          component='label'
          sx={{
            border: '2px solid #0288d1',
            marginRight: '10px!important',
            borderRadius: '5px',
          }}
          variant='text'
          tabIndex={-1}
          onChange={(e) => {
            const uploadedFile = e.target.files[0]

            if (uploadedFile) {
              const readFile = new FileReader()
              readFile.onload = function (e) {
                const contents = e.target.result
                const json = JSON.parse(contents)
                setProfileName(json.name)
                setDataProfile({
                  points: json.points,
                  shelves: json.shelves,
                  mode: 'manual',
                  name: json.name,
                  board: false,
                  repeat: 1
                })
                setOpenAlert(true)
              }
              readFile.readAsText(uploadedFile)
            }
          }}
          // variant="outlined"
          color='info'
          startIcon={<UploadFileIcon sx={{ fontSize: '25px!important' }} />}
        >
          <VisuallyHiddenInput type='file' /> Загрузить
        </Button>
        <IconButton
          edge='start'
          color='success'
          sx={{
            mr: '7px',
            lineHeight: '1.75',
            border: '2px solid #2e7d32',
            borderRadius: '5px',
            // background: '#fff',
            // color: '#2e7d32',
            padding: '6px 8px'
          }}
          onClick={() => {
            setOpenCreateProfileDialog(true)
          }}
          // aria-label="close"
        >
          <AddCircleIcon size='large' />
          <span
            style={{
              paddingLeft: '5px',
              fontSize: '0.875rem',
              fontWeight: '500',
              letterSpacing: '0.02857em'
            }}
          >
            ДОБАВИТЬ
          </span>
        </IconButton>
      </div>
      <Dialog
        open={openAlert}
        aria-labelledby='alert-dialog-title'
        aria-describedby='alert-dialog-description'
      >
        <DialogTitle id='alert-dialog-title'>{'Импорт'}</DialogTitle>
        <DialogContent>
          <DialogContentText id='alert-dialog-description'>
            <Typography variant='span' component={'span'}>
              {`Загрузить профиль: ${profileName}?`}
              <br />
              <br />
            </Typography>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            color='error'
            onClick={() => {
              setOpenAlert(false)
            }}
          >
            Отмена
          </Button>
          <Button
            color='success'
            onClick={() => {
              ovenStore.profilesStore.createProfile(JSON.stringify(profileData))
              setOpenAlert(false)
            }}
          >
            Загрузить
          </Button>
        </DialogActions>
      </Dialog>
      {openCreateProfileDialog && (
        <CreateProfileDialog
          isOpen={openCreateProfileDialog}
          setOpen={setOpenCreateProfileDialog}
          onSubmit={setOpenEditModalHaldler}
        />
      )}
    </Grid>
  )
})
