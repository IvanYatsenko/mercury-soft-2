import React, { useState } from 'react'
import {
  AppBar,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  Grid,
  IconButton,
  Input,
  Switch,
  Toolbar
} from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import DeleteIcon from '@mui/icons-material/Delete'
import FileCopyIcon from '@mui/icons-material/FileCopy'
import ReactEcharts from 'echarts-for-react'
import { ManualModeTable } from './ManualModeTable/ManualModeTable'
import { EasyModeTable } from './EasyModeTable/EasyModeTable'
import { observer } from 'mobx-react-lite'
import { DialogRemoveProfile } from '../ProfilesView/DialogRemoveProfile'

const progressMap = (state) => [state.second, state.temperature.t2]
const progressMapBoard = (state) => [state.second, state.temperature.t1]
const profileMap = (p) => [p.second, p.temperature]
const tooltipFormatter = (params) =>
  params.value[0] + 'сек</br/>' + params.value[1] + '&#176C '

export const EditProfileView = observer(
  ({ openModal, handleClose, profile, ovenStore, progress = [] }) => {
    const [mode, setMode] = useState(profile.state.mode)
    const [nameProfile, setNameProfile] = useState(profile.state.name)
    const [openDialogMode, setOpenDialogMode] = useState(false)
    const [points, setPoints] = useState(profile.state.points)
    const [shelves, setShelves] = useState(profile.state.shelves)
    const [board, setBoard] = useState(profile.state.board)
    const [openRemoveProfileDialog, setOpenRemoveProfileDialog] =
      useState(false)

    const removeProfileDialog = () => {
      setOpenRemoveProfileDialog(false)
      ovenStore.profilesStore.removeProfile(`${profile.filepath}`)
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

    const changeboard = () => {
      setBoard(!board)
    }

    const setSecondValue = (value, index) => {
      const newPoints = points
      newPoints[index] = {
        temperature: newPoints[index].temperature,
        second: value
      }
      setPoints([...newPoints])
    }

    const setTemperatureValue = (value, index) => {
      let newTemp = value
      const maxTemp = ovenStore.thermalProtection ? 280 : 330

      if(value > maxTemp) {
        newTemp = maxTemp
      }

      if(value < 30) {
        newTemp = 30
      }

      const newPoints = points
      newPoints[index] = { temperature: newTemp, second: newPoints[index].second }
      setPoints([...newPoints])
    }

    const toggleUpPoint = (index) => {
      const temp1Point = points[index]
      const temp2Point = points[index - 1]
      const newPoints = points
      newPoints[index] = temp2Point
      newPoints[index - 1] = temp1Point
      setPoints([...newPoints])
    }

    const toggleDownPoint = (index) => {
      const temp1Point = points[index]
      const temp2Point = points[index + 1]
      const newPoints = points
      newPoints[index] = temp2Point
      newPoints[index + 1] = temp1Point
      setPoints([...newPoints])
    }

    const removePoint = (index) => {
      setPoints([...points.filter((p, i) => i != index)])
    }

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

    const handleCloseModal = () => {
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
      handleClose(false)
    }

    const style = {
      // height: '150px',
      width: '100%',
      maxWidth: '640px',
      float: 'left',
      marginTop: '-15px'
    }

    const absolutePoints = (points) => {
      if (points.length === 0) {
        return []
      }

      const [first, ...rest] = points

      return rest.reduce(
        (arr, cur) => {
          const last = arr[arr.length - 1]
          arr.push({
            second: cur.second + last.second,
            temperature: cur.temperature
          })
          return arr
        },
        [first]
      )
    }

    const t1 = board
      ? progress.map(progressMapBoard)
      : progress.map(progressMap)
    const t2 = board ? progress.map(progressMapBoard) : 0
    const profileData = absolutePoints(points).map(profileMap)

    const option = {
      title: {
        show: false
      },
      tooltip: {
        formatter: tooltipFormatter
      },
      grid: {
        left: 30,
        top: 25,
        right: 25,
        bottom: 30
      },
      xAxis: [
        {
          type: 'value',
          scale: true
        }
      ],
      yAxis: [
        {
          type: 'value',
          scale: true
        }
      ],
      series: [
        {
          name: 'I',
          type: 'scatter',
          data: t1,
          smooth: 0.15,
          z: 4
        },
        {
          name: 'II',
          type: 'scatter',
          data: t2,
          smooth: 0.15,
          z: 1
        },
        {
          name: 'line',
          type: 'line',
          data: profileData,
          smooth: 0.15,
          z: 5
        }
      ]
    }

    return (
      <Dialog
        fullScreen
        disableEscapeKeyDown
        open={openModal}
        onClose={handleCloseModal}
      >
        <AppBar color='inherit' sx={{ position: 'relative' }}>
          <Toolbar>
            <Input
              color='success'
              sx={{
                ml: 2,
                mr: 1,
                flex: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
              value={nameProfile}
              onChange={(e) => {
                setNameProfile(e.target.value)
              }}
            />

            <IconButton
              edge='start'
              color='success'
              onClick={handleCloseModal}
              aria-label='close'
            >
              <SaveIcon />
            </IconButton>
          </Toolbar>
        </AppBar>
        <Grid container>
          <Grid item xs={12} md={6}>
            <Box sx={{ p: 1 }}>
              <Box>
                {mode == 'manual' ? (
                  <ManualModeTable
                    setSecondValue={setSecondValue}
                    setTemperatureValue={setTemperatureValue}
                    points={points}
                    setPoints={setPoints}
                    toggleUpPoint={toggleUpPoint}
                    toggleDownPoint={toggleDownPoint}
                    removePoint={removePoint}
                  />
                ) : (
                  <EasyModeTable
                    shelves={shelves}
                    setShelves={setShelves}
                    updatePointsByShelves={updatePointsByShelves}
                    setPoints={setPoints}
                    thermalProtection={ovenStore.thermalProtection}
                  />
                )}
              </Box>
              <Box
                sx={{
                  mt: 2,
                  mb: 2,
                  display: 'flex',
                  gap: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexWrap: 'wrap'
                }}
              >
                <Button
                  color='info'
                  variant='outlined'
                  startIcon={<FileCopyIcon />}
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
                  Копировать профиль
                </Button>
                <Button
                  color='error'
                  variant='outlined'
                  startIcon={<DeleteIcon />}
                  onClick={() => {
                    setOpenRemoveProfileDialog(true)
                  }}
                >
                  Удалить профиль
                </Button>
              </Box>
            </Box>
          </Grid>
          <Grid item xs={12} md={6}>
            <Box
              sx={{
                display: 'flex',
                gap: 1,
                alignItems: 'center',
                justifyContent: 'center',
                flexWrap: 'wrap',
                p: 1,
                mt: 1
              }}
            >
              <FormGroup color='success' sx={{ display: 'block' }}>
                <FormControlLabel
                  color='success'
                  control={
                    <Switch
                      onChange={handleSelectMode}
                      checked={mode == 'manual'}
                      color='success'
                    />
                  }
                  label={'Детальный режим'}
                />
                <FormControlLabel
                  color='success'
                  control={
                    <Switch
                      checked={board}
                      onChange={changeboard}
                      color='success'
                    />
                  }
                  label={'Использовать датчик на плате'}
                />
              </FormGroup>
            </Box>
            <Box
              sx={{
                p: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <ReactEcharts
                option={option}
                style={style}
                lazyUpdate
                opts={{ renderer: 'svg' }}
              />
            </Box>
          </Grid>
        </Grid>
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
        {openRemoveProfileDialog && (
          <DialogRemoveProfile
            onClose={() => setOpenRemoveProfileDialog(false)}
            onSubmit={removeProfileDialog}
            open={openRemoveProfileDialog}
            profileName={profile.state.name}
          />
        )}
      </Dialog>
    )
  }
)
