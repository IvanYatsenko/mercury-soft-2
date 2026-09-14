import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Grid,
  Stack,
  Typography
} from '@mui/material'
import ReactEcharts from 'echarts-for-react'
import { observer } from 'mobx-react-lite'
import React, { useState } from 'react'

const progressMap = (state) => [state.second, state.temperature.t2]
const progressMapBoard = (state) => [state.second, state.temperature.t1]
const profileMap = (p) => [p.second, p.temperature]
const tooltipFormatter = (params) =>
  params.value[0] + 'сек</br/>' + params.value[1] + '&#176C '

export const StatusView = observer(
  ({
    closeProgressPage,
    profileName,
    isActive,
    ovenTemp,
    ovenFanSpeed,
    timeHorizon,
    errors,
    status,
    // debugMode = false,
    points = [],
    isBoardTemp = false,
    progress = []
  }) => {
    const [openAlert, setOpenAlert] = useState(false)
    const onSuccesCloseAlert = () => {
      closeProgressPage()
      setOpenAlert(false)
    }

    const onCancelCloseAlert = () => {
      setOpenAlert(false)
    }
    const toTime = (timeHorizon) => {
      return `${Math.floor(timeHorizon / 60)
        .toString()
        .padStart(2, '0')}
                  :
                  ${(Math.floor(timeHorizon) % 60).toString().padStart(2, '0')}`
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

    const t1 = isBoardTemp
      ? progress.map(progressMapBoard)
      : progress.map(progressMap)
    const t2 = isBoardTemp ? progress.map(progressMapBoard) : 0
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
      <Grid
        className={isActive ? 'StatusView StatusView--active' : 'StatusView'}
        item
        xs={12}
        md={6}
        sx={{ pt: 1 }}
      >
        <Typography
          variant='h6'
          color='#2e7d32'
          component='span'
          sx={{ pl: 1 }}
        >
          Состояние
        </Typography>
        <Divider sx={{ pb: 1 }} />
        <Grid container>
          <Grid item xs={8}>
            <Box sx={{ p: 1 }}>
              <Stack spacing={1}>
                <div>Температура печи</div>
                <Divider />
                <div>Обороты вентилятора</div>
                <Divider />
                <div>Статус</div>
                <Divider />
              </Stack>
            </Box>
          </Grid>
          <Grid item xs={4}>
            <Box sx={{ p: 1 }}>
              <Stack spacing={1}>
                <div>
                  {isBoardTemp ? ovenTemp.t1 + '°' : ovenTemp.t2 + '°'}
                </div>
                <Divider />
                <div>{`${ovenFanSpeed} об/мин`}</div>
                <Divider />
                {status == 'idle' && <div> Готов</div>}
                {status == 'busy' && <div> В работе</div>}
                {status == 'finish' && <div> Завершен</div>}
                <Divider />
              </Stack>
            </Box>
          </Grid>
        </Grid>
        {status == 'idle' ? (
          <></>
        ) : (
          <>
            <Grid item xs={12}>
              <Box>
                <Grid container>
                  <Grid item xs={8}>
                    <Box sx={{ p: 1 }}>
                      <Stack spacing={1}>
                        <div>Название профиля:</div>
                        <Divider />
                        <div>Ошибок в работе:</div>
                        <Divider />
                        <div>Осталось:</div>
                        <Divider />
                      </Stack>
                    </Box>
                  </Grid>
                  <Grid item xs={4}>
                    <Box sx={{ p: 1 }}>
                      <Stack spacing={1}>
                        <div
                          style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {profileName ? `${profileName.toString()}` : ''}
                        </div>
                        <Divider />
                        <div>
                          {errors.doorError +
                            errors.fanError +
                            errors.itmpError +
                            errors.ovenTempError +
                            errors.profileError}
                        </div>
                        <Divider />
                        <div>{toTime(timeHorizon)}</div>
                        <Divider />
                      </Stack>
                    </Box>
                  </Grid>
                </Grid>
              </Box>
            </Grid>
            <Grid item xs={12}>
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
              <Box sx={{ textAlign: 'center', p: 1 }}>
                <Button
                  variant='outlined'
                  color='warning'
                  onClick={() => {
                    setOpenAlert(true)
                  }}
                >
                  Завершить выполнение профиля
                </Button>
              </Box>
            </Grid>
            <Dialog
              open={openAlert}
              aria-labelledby='alert-dialog-title'
              aria-describedby='alert-dialog-description'
            >
              <DialogTitle id='alert-dialog-title'>
                {'Прекращение работы профиля'}
              </DialogTitle>
              <DialogContent>
                <DialogContentText id='alert-dialog-description'>
                  <Typography variant='span' component={'span'} color='red'>
                    {`Завершить действующий процесс: ${profileName}`}
                    <br />
                    <br />
                  </Typography>
                </DialogContentText>
              </DialogContent>
              <DialogActions>
                <Button color='success' onClick={onCancelCloseAlert}>
                  Отмена
                </Button>
                <Button color='error' onClick={onSuccesCloseAlert}>
                  Завершить
                </Button>
              </DialogActions>
            </Dialog>
          </>
        )}
      </Grid>
    )
  }
)
