import React from 'react'
import { useState } from 'react'
import { ProfilesList } from '../../ProfilesList/ProfilesList'
import { StatusList } from '../../StatusList/StatusList'
import {
  AppBar,
  Avatar,
  CircularProgress,
  FormControlLabel,
  FormGroup,
  Grid,
  IconButton,
  Switch,
  Toolbar,
  Typography
} from '@mui/material'
import ArrowCircleDownIcon from '@mui/icons-material/ArrowCircleDown'
import ArrowCircleUpIcon from '@mui/icons-material/ArrowCircleUp'
import RouterIcon from '@mui/icons-material/Router'
import AddCircleIcon from '@mui/icons-material/AddCircle'
import { ProfileModal } from '../../ProfileModal/ProfileModal'
import { observer } from 'mobx-react-lite'
import { InfoModal } from '../../InfoModal/InfoModal'
import { CreateProfileDialog } from '../../CreateProfileDialog/CreateProfileDialog'
import iconMercury from '../../../assets/mercury1.ico?asset'
import { LayoutProfile } from '../../../Constants/LayoutProfile'
import { AlertModal } from '../../AlertModal/AlertModal'
import { WifiModal } from '../../WifiModal/WifiModal'

export const MainOvenView = observer(({ ovenStore }) => {
  const [openProfileModal, setOpenProfileModal] = useState(false)
  const [openInfoModal, setOpenInfoModal] = useState(false)
  const [openCreateProfileDialog, setOpenCreateProfileDialog] = useState(false)
  const [openWifiModal, setOpenWifiModal] = useState(false)
  // const [newProfile, setNewProfile] = useState['']

  const scrollUp = () => window.scrollBy(0, -100)
  const scrollDown = () => window.scrollBy(0, 100)

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

  const setCloseInfoModal = () => {
    setOpenInfoModal(false)
  }
  return ovenStore.isLoading ? (
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
      <CircularProgress color='error' disableShrink />
    </div>
  ) : (
    <>
      <AppBar position='relative' color='transparent' sx={{ mb: 1 }}>
        <Toolbar>
          <Typography sx={{ ml: 2 }} variant='h6' component='div'>
            <IconButton
              edge='start'
              color='inherit'
              onClick={() => {
                setOpenInfoModal(true)
              }}
              aria-label='info'
            >
              {/* <InfoOutlinedIcon /> */}
              <Avatar
                sx={{
                  height: '25px',
                  width: '25px',
                  marginRight: '15px',
                  marginLeft: '-15px'
                }}
                srcSet={iconMercury}
              />
              <Typography component='span'>Меркурий</Typography>
            </IconButton>
          </Typography>
          <Typography sx={{ ml: '30px' }} variant='span' component='div'>
            <FormGroup>
              <FormControlLabel
                sx={{ whiteSpace: 'nowrap' }}
                label={'Поддержание 100°C'}
                labelPlacement='start'
                control={
                  <Switch
                    color='warning'
                    onChange={() => {
                      ovenStore.keepHeat()
                    }}
                    checked={ovenStore.heat}
                  />
                }
              />
            </FormGroup>
          </Typography>
          <div style={{ flex: '1 1 auto' }}></div>
          <IconButton
            edge='start'
            color='inherit'
            onClick={() => {
              setOpenWifiModal(true)
            }}
          >
            <RouterIcon color={ovenStore.statusAP ? 'success' : 'inherit'} />
            {/* <ExitToAppIcon /> */}
          </IconButton>
        </Toolbar>
      </AppBar>
      {openCreateProfileDialog && (
        <CreateProfileDialog
          isOpen={openCreateProfileDialog}
          setOpen={setOpenCreateProfileDialog}
          onSubmit={setOpenEditModalHaldler}
        />
      )}
      <Grid container rowSpacing={1} columnSpacing={1}>
        <Grid item xs={10}>
          <ProfilesList
            profiles={ovenStore.profilesStore.profiles}
            ovenStore={ovenStore}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: '1rem'
            }}
          >
            <IconButton
              edge='start'
              color='success'
              sx={{
                mr: '7px',
                border: '2px solid #2e7d32',
                borderRadius: '5px',
                // background: '#fff',
                // color: '#2e7d32',
                padding: '5px 8px'
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
                  fontSize: '1rem',
                  fontWeight: '500'
                }}
              >
                Добавить профиль
              </span>
            </IconButton>
          </div>
        </Grid>
        <Grid item xs={2}>
          <StatusList
            ovenTemp={ovenStore.temperature}
            ovenFanSpeed={ovenStore.convFreqSpeed}
            timeHorizon={ovenStore.timeHorizon}
            errors={ovenStore.errorStore}
            status={ovenStore.state}
            debugMode={ovenStore.debugMode}
          />
        </Grid>
      </Grid>
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
      {openProfileModal && (
        <ProfileModal
          openModal={openProfileModal}
          openModalHandler={setOpenProfileModal}
          // profileStore={ovenStore.profiles[ovenStore.profiles.length - 1]}
          // ovenStore={ovenStore}
          // profile={}
          ovenStore={ovenStore}
        />
      )}
      <InfoModal
        ovenIP={ovenStore.ip}
        onOpen={openInfoModal}
        setClose={setCloseInfoModal}
        version={ovenStore.version}
        handleUpdate={ovenStore.updateApp}
        downloadApp={ovenStore.downloadApp}
        installApp={ovenStore.installApp}
        versionToUpdate={ovenStore.versionToUpdate}
        updateFlag={ovenStore.updateFlag}
        downloadFlag={ovenStore.downloadFlag}
        errorDownloadFile={ovenStore.errorDownloadFile}
        readyToUpdate={ovenStore.readyToUpdate}
        _checkFlagMD5={ovenStore._checkFlagMD5}
        moveFile={ovenStore.moveFile}
        removeFile={ovenStore.removeFile}
        unzipFile={ovenStore.unzipFile}
        chmodeFile={ovenStore.chmodeFile}
      />
      <AlertModal stat={ovenStore.stat} />
      <WifiModal
        open={openWifiModal}
        setOpen={setOpenWifiModal}
        updateWifiAps={ovenStore.updateWifiAps}
        listAP={ovenStore.listAP}
        statusAP={ovenStore.statusAP}
        onWifiAp={ovenStore.onWifiAp}
        offWifiAp={ovenStore.offWifiAp}
        connectHandle={ovenStore.connectWifiAp}
        disconnectHandle={ovenStore.disconnectWifiAp}
      />
    </>
  )
})
