import React, { useState } from 'react'
import {
  AppBar,
  Dialog,
  Input,
  Grid,
  IconButton,
  ListItem,
  List,
  Toolbar,
  Typography,
  Button,
  InputLabel,
  FormControl,
  Select,
  MenuItem,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText
} from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import SaveIcon from '@mui/icons-material/Save'
import { ScheduleProfile } from '../ScheduleProfile/ScheduleProfile'
import { PointsTable } from './PointsTable'
import { DialogModalKeyboardFull } from '../UI/DialogModalKeyboardFull/DialogModalKeyboardFull'
import { observer } from 'mobx-react-lite'
import ArrowCircleDownIcon from '@mui/icons-material/ArrowCircleDown'
import ArrowCircleUpIcon from '@mui/icons-material/ArrowCircleUp'
import FileCopyIcon from '@mui/icons-material/FileCopy'
import { ShelvesTable } from './ShelvesTable'

export const ProfileModal = observer(
  ({
    openModal,
    openModalHandler,
    ovenStore,
    profile = { state: { name: '', points: [] } }
  }) => {
    const [openEditNameModal, setOpenEditNameModal] = useState(false)
    const [mode, setMode] = useState(profile.state.mode)
    const [nameProfile, setNameProfile] = useState(profile.state.name)
    const [openDialogMode, setOpenDialogMode] = useState(false)
    const [points, setPoints] = useState(profile.state.points)
    const [shelves, setShelves] = useState(profile.state.shelves)
    const [board, setBoard] = useState(profile.state.board)

    const updatePointsByShelves = (shelves) => {
      const points = [{ second: 0, temperature: 30 }]

      let heatSpeed = 0.8

      let coolSpeed250 = 0.4
      let coolSpeed200 = 0.3
      let coolSpeed150 = 0.2

      for (let i = 0; i < shelves.length - 1; i++) {
        let a =
          (shelves[i].temperature - points[points.length - 1].temperature) /
          heatSpeed
        if (a < 0) {
          a = -a * heatSpeed * coolSpeed150
        }

        points.push({
          second: Math.round(a),
          temperature: shelves[i].temperature
        })
        points.push(shelves[i])
      }

      let prevTemp = points[points.length - 1].temperature
      let coolTemp = shelves[shelves.length - 1].temperature

      let coolSpeed = coolSpeed250

      if (prevTemp > 200 && coolTemp < 200) {
        const coolingTime = (prevTemp - 200) / coolSpeed250
        points.push({ second: Math.round(coolingTime), temperature: 200 })
        prevTemp = 200
        coolSpeed = coolSpeed200
      }

      if (prevTemp > 150 && coolTemp < 150) {
        const coolingTime = (prevTemp - 150) / coolSpeed200
        points.push({ second: Math.round(coolingTime), temperature: 150 })
        prevTemp = 150
        coolSpeed = coolSpeed150
      }

      let coolingTime = (prevTemp - coolTemp) / coolSpeed
      if (coolingTime < 0) {
        coolingTime = (-coolingTime * coolSpeed) / heatSpeed
      }

      points.push({ second: Math.round(coolingTime), temperature: coolTemp })
      return points
    }

    const updateShelvesByPoints = (points) => {
      const shelves = []

      points.filter((value, i) => {
        if (
          i < points.length - 1 &&
          value.temperature === points[i + 1].temperature
        ) {
          if (shelves.length < 2) {
            shelves.push(points[i + 1])
          }
        }
      })

      if (shelves.length < 1) {
        shelves.push({ second: 110, temperature: 150 })
      }

      if (shelves.length < 2) {
        shelves.push({ second: 50, temperature: 220 })
      }

      let lastTemp = 100
      const pLen = points.length
      if (pLen > 0) {
        lastTemp = points[pLen - 1].temperature
      }

      shelves.push({ second: 0, temperature: lastTemp })
      return shelves
    }

    const checkEquality = () => {
      let oldProfileJson = JSON.stringify(profile.state)
      let newProfile = JSON.parse(oldProfileJson)
      newProfile.shelves = updateShelvesByPoints(newProfile.points)
      newProfile.points = updatePointsByShelves(newProfile.shelves)

      let newProfileJson = JSON.stringify(newProfile)
      return oldProfileJson === newProfileJson
    }

    const onModeChange = () => {
      if (mode == 'manual') {
        setMode('easy')
        setShelves([...updateShelvesByPoints(points)])
        setPoints([...updatePointsByShelves(shelves)])
      } else {
        setMode('manual')
        setPoints[updatePointsByShelves(shelves)]
      }
    }

    const handleSelectMode = () => {
      if (mode == 'easy') {
        onModeChange()
        return
      }

      let equal = checkEquality(profile)
      if (equal) {
        onModeChange()
      } else {
        setOpenDialogMode(true)
      }
    }

    const handleClose = () => {
      const profileData = {
        board: board,
        mode: mode,
        name: nameProfile,
        points: points,
        repeat: profile.repeat,
        shelves: shelves
      }
      ovenStore.profilesStore.updateProfile(
        JSON.stringify(profileData),
        profile.filepath
      )
      openModalHandler(false)
    }

    const scrollUp = () =>
      document.getElementById(profile.filepath).scrollBy(0, -100)
    const scrollDown = () =>
      document.getElementById(profile.filepath).scrollBy(0, 100)

    const onSubmit = (newName) => {
      setNameProfile(newName)
      setOpenEditNameModal(false)
    }

    return (
      <Dialog
        fullScreen
        open={openModal}
        onClose={handleClose}
        disableEscapeKeyDown
      >
        <AppBar sx={{ position: 'relative' }} color='transparent'>
          <Toolbar>
            <Typography sx={{ ml: 2, flex: 1 }} variant='div' component='div'>
              Редактирование - {nameProfile}
            </Typography>
            <IconButton
              edge='start'
              color='inherit'
              onClick={handleClose}
              aria-label='close'
            >
              <SaveIcon />
            </IconButton>
          </Toolbar>
        </AppBar>
        <List id={profile.filepath} sx={{ overflowY: 'auto' }}>
          <ListItem>
            <Grid container rowSpacing={1} columnSpacing={1}>
              <Grid item xs={8}>
                <Input
                  fullWidth
                  value={nameProfile}
                  readOnly
                  color='success'
                  sx={{ mb: 1 }}
                  onClick={() => {
                    setOpenEditNameModal(true)
                  }}
                />
                <div style={{ marginBottom: '1rem', marginTop: '1rem' }}>
                  <FormControl fullWidth>
                    <InputLabel color='success' id='select-mode-input'>
                      Выбор режима
                    </InputLabel>
                    <Select
                      color='success'
                      labelId='select-mode-input'
                      value={mode}
                      label='Выбор режима'
                      onChange={handleSelectMode}
                    >
                      <MenuItem value='easy'>Упрощенный режим</MenuItem>
                      <MenuItem value='manual'>Детальный режим</MenuItem>
                    </Select>
                  </FormControl>
                </div>
              </Grid>
              <Grid container rowSpacing={1} columnSpacing={1}>
                <Grid item xs={10}>
                  {mode === 'easy' ? (
                    <ShelvesTable
                      thermalProtection={ovenStore.thermalProtection}
                      shelves={shelves}
                      setShelves={setShelves}
                      updatePointsByShelves={updatePointsByShelves}
                      setPoints={setPoints}
                      board={board}
                      setBoard={setBoard}
                    />
                  ) : (
                    <PointsTable
                      thermalProtection={ovenStore.thermalProtection}
                      points={points}
                      setPoints={setPoints}
                      board={board}
                      setBoard={setBoard}
                    />
                  )}
                  <div
                    style={{
                      margin: '10px auto',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Button
                      variant='outlined'
                      color='error'
                      startIcon={<DeleteIcon />}
                      onClick={() => {
                        ovenStore.profilesStore.removeProfile(profile.filepath)
                        openModalHandler(false)
                      }}
                    >
                      Удалить профиль
                    </Button>
                    <Button
                      variant='outlined'
                      color='info'
                      sx={{ ml: 1 }}
                      startIcon={<FileCopyIcon />}
                      onClick={() => {
                        const profileData = {
                          board: board,
                          mode: mode,
                          name: nameProfile + ' - Копия',
                          points: points,
                          repeat: profile.repeat,
                          shelves: shelves
                        }
                        ovenStore.profilesStore.createProfile(
                          JSON.stringify(profileData)
                        )
                        openModalHandler(false)
                      }}
                    >
                      Копировать профиль
                    </Button>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <ScheduleProfile
                      points={points}
                      width={'80%'}
                      height={'60vh'}
                    />
                  </div>
                </Grid>
              </Grid>
            </Grid>
          </ListItem>
          <div
            style={{
              position: 'sticky',
              right: '8px',
              bottom: '50px',
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
              onClick={(e) => scrollUp(e)}
            >
              <ArrowCircleUpIcon sx={{ fontSize: '40px' }} />
            </IconButton>
            <IconButton
              sx={{ padding: 0, mr: '1rem' }}
              color='success'
              size='large'
              variant='contained'
              onClick={(e) => scrollDown(e)}
            >
              <ArrowCircleDownIcon sx={{ fontSize: '40px' }} />
            </IconButton>
          </div>
        </List>

        {openEditNameModal && (
          <DialogModalKeyboardFull
            openModal={openEditNameModal}
            openModalHandler={setOpenEditNameModal}
            enableHandler={onSubmit}
            value={nameProfile}
          />
        )}
        {openDialogMode && (
          <Dialog
            open={openDialogMode}
            onClose={() => {
              setOpenDialogMode(false)
            }}
            aria-labelledby='dialog-mode-title'
            aria-describedby='dialog-mode-descr'
          >
            <DialogTitle>Внимание!</DialogTitle>
            <DialogContent>
              <DialogContentText>
                При изменении режима на упрощенный, профиль упростится и часть
                данных может потеряться.
                <br />
                <br />
                <br />
                Продолжить?
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button
                color='success'
                positive
                onClick={() => {
                  onModeChange()
                  setOpenDialogMode(false)
                }}
              >
                Да
              </Button>
              <Button onClick={() => setOpenDialogMode(false)} color='error'>
                Нет
              </Button>
            </DialogActions>
          </Dialog>
        )}
      </Dialog>
    )
  }
)
