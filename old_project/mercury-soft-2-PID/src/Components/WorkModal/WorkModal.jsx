import React, { useEffect, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import List from '@mui/material/List'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import ListItem from '@mui/material/ListItem'
import { ScheduleProfile } from '../ScheduleProfile/ScheduleProfile'
import { StatusList } from './../StatusList/StatusList'
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline'
import StopCircleIcon from '@mui/icons-material/StopCircle'
import { observer } from 'mobx-react-lite'
import { Box, Button, Modal, Slider } from '@mui/material'
import { IRIcon } from '../../assets/icons/IRIcon'
import { HeaterIcon } from '../../assets/icons/HeaterIcon'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { FanIcon } from '../../assets/icons/FanIcon'

export const WorkModal = observer(
  ({ openModal, openModalHandler, profile, ovenStore }) => {
    const [lockModal, setLockModal] = useState(false)
    const [error, setError] = useState(false)
    const [warning, setWarning] = useState(false)
    const [succes, setSucces] = useState(false)
    const [onBoard, setOnBoard] = useState(false)
    const [modalComplete, setModalComplete] = useState(false)
    const [modalErrors, setModalErrors] = useState(false)

    const handleChangeRepeat = (event, newValue) => {
      ovenStore.setRepeate(newValue)
      console.log(newValue)
    }

    const closeModalComplete = () => {
      ovenStore.offFinishSound()
      // ovenStore.closeProgressPage()
      // ovenStore.clearCriticalError()
      setLockModal(false)
      setWarning(false)
      setError(false)
      setSucces(false)
      setModalComplete(false)
    }

    useEffect(() => {
      if (ovenStore.state === 'finish') {
        setSucces(true)
        setWarning(false)
        setError(false)
        setModalComplete(true)
      }
      if (ovenStore.state === 'idle') {
        setSucces(false)
        setWarning(false)
        setError(false)
        setModalComplete(false)
      }
    }, [ovenStore.state])

    useEffect(() => {
      setOnBoard(profile.state.board)
    }, [profile.state.board])

    useEffect(() => {
      if (ovenStore.errorFlag) {
        setModalErrors(true)
      }
      setError(ovenStore.errorFlag)
    }, [ovenStore.errorFlag])
    useEffect(() => {
      setWarning(ovenStore.warningFlag)
    }, [ovenStore.warningFlag])

    useEffect(() => {
      setWarning(
        ovenStore.errorStore.profileError > 5 ||
          ovenStore.errorStore.fanError > 5 ||
          ovenStore.errorStore.doorError > 5 ||
          ovenStore.errorStore.itmpError > 5
      )
      if (
        ovenStore.errorStore.profileError > 20 ||
        ovenStore.errorStore.itmpError > 20
      ) {
        ovenStore.closeProgressPage()
        setLockModal(false)
        setWarning(false)
        setError(false)
        setSucces(false)
      }
    }, [
      ovenStore.errorStore.profileError,
      ovenStore.errorStore.fanError,
      ovenStore.errorStore.doorError,
      ovenStore.errorStore.itmpError,
      ovenStore
    ])

    // useEffect(() => {
    //   setError(ovenStore.errorStore.ovenTempError > 0)
    // }, [ovenStore.errorStore.ovenTempError])

    useEffect(() => {
      if (ovenStore.criticalError) {
        setWarning(false)
        setSucces(false)
        setError(true)
      }
    }, [ovenStore.criticalError])

    useEffect(() => {
      if (ovenStore.state == 'idle') {
        setLockModal(false)
        setWarning(false)
        setError(false)
        setSucces(false)
      }
    }, [ovenStore.state])

    // const [workPoints, setWorkPoints] = useState([])

    function handleClose() {
      ovenStore.closeProgressPage()
      ovenStore.clearCriticalError()
      setModalComplete(false)
      setModalErrors(false)
      setError(false)
      setSucces(false)
      setWarning(false)
      openModalHandler(false)
    }

    const startWork = () => {
      setLockModal(true)
      setError(false)
      setSucces(false)
      setWarning(false)
      ovenStore.onCloseErrorFunModal()
      // ovenStore.startWork(profile)
      ovenStore.startEvent({ filepath: profile.filepath })
    }

    const stopWork = () => {
      ovenStore.closeProgressPage()
      setLockModal(false)
      setWarning(false)
      setError(false)
      setSucces(false)
      // ovenStore.stopWork()
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
            <Typography
              sx={{ ml: '0px', flex: 1, display: 'flex' }}
              variant='h6'
              component='div'
            >
              <span
                style={{
                  width: '150px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {profile.state.name}
              </span>
              <div style={{ display: 'flex', gap: '5px' }}>
                {ovenStore.heatIndicators && ovenStore.heatIndicators.tens ? (
                  <HeaterIcon green />
                ) : (
                  <HeaterIcon gray />
                )}
                {ovenStore.heatIndicators && ovenStore.heatIndicators.IR ? (
                  <IRIcon green />
                ) : (
                  <IRIcon gray />
                )}
                {ovenStore.heatIndicators && ovenStore.heatIndicators.fans ? (
                  <FanIcon green />
                ) : (
                  <FanIcon gray />
                )}

                <WarningAmberIcon
                  onClick={() => setModalErrors(true)}
                  color={
                    ovenStore.errorStore.profileError ||
                    ovenStore.errorStore.fanError ||
                    ovenStore.errorStore.doorError ||
                    ovenStore.errorStore.ovenTempError ||
                    ovenStore.errorStore.itmpError
                      ? 'warning'
                      : 'disabled'
                  }
                  sx={{ marginLeft: '20px', marginTop: '4px' }}
                />
              </div>
            </Typography>
            <div style={{ position: 'absolute', right: '70px' }}>
              {!lockModal ? (
                <div style={{  }}>
                  <div>
                    <Button
                      sx={{ border: '1px solid #fff', flex: '1 1 auto' }}
                      color='success'
                      // size='large'
                      variant='contained'
                      onClick={startWork}
                      startIcon={
                        <PlayCircleOutlineIcon
                          fontSize='inherit'
                          color='inherit'
                        />
                      }
                    >
                      Пуск
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <Button
                    sx={{ border: '1px solid #fff' }}
                    color='error'
                    // size='large'
                    variant='contained'
                    onClick={stopWork}
                    startIcon={
                      <StopCircleIcon fontSize='inherit' color='inherit' />
                    }
                  >
                    Стоп
                  </Button>
                </>
              )}
            </div>
            {!lockModal && (
              <IconButton
                edge='start'
                color='inherit'
                onClick={handleClose}
                aria-label='close'
              >
                <CloseIcon />
              </IconButton>
            )}
          </Toolbar>
        </AppBar>
        <List
          className={
            error
              ? 'error'
              : '' || warning
              ? 'warning'
              : '' || succes
              ? 'succes'
              : ''
          }
        >
          <ListItem>
            <div style={{ alignSelf: 'flex-start', flex: '1 1 auto' }}>
              <div
                style={{
                  alignSelf: 'flex-start',
                  display: 'flex',
                  justifyContent: 'space-around',
                  flex: '1 1 auto',
                  alignItems: 'center'
                }}
              ></div>
              <div
                style={{
                  alignSelf: 'flex-start',
                  flex: '1 1 auto',
                  width: '90%'
                }}
              >
                <ScheduleProfile
                  height={ovenStore.debugMode ? '70vh' : '82vh'}
                  width={'380px'}
                  points={profile.state.points}
                  progress={ovenStore.progress}
                  isBoardTemp={onBoard}
                  deviationProfileSheldule={ovenStore.deviationProfileSheldule}
                  deviationsPoints={ovenStore.debugMode ? ovenStore.deviationsPoints : []}
                />
              </div>
            </div>
            <div
              style={{
                alignSelf: 'flex-start',
                width: '100px',
                maxWidth: '100px'
              }}
            >
              <StatusList
                ovenTemp={ovenStore.temperature}
                ovenFanSpeed={ovenStore.convFreqSpeed}
                timeHorizon={ovenStore.timeHorizon}
                errors={ovenStore.errorStore}
                status={ovenStore.state}
                onBoard={onBoard}
                debugMode={ovenStore.debugMode}
                deviationProfileSheldule={ovenStore.deviationProfileSheldule}
                deviationProfileShelduleMax={ovenStore.deviationProfileShelduleMax}
              />
            </div>
          </ListItem>
          {ovenStore.debugMode ? (
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column'}}>
                      <span style={{marginBottom: '-0.5rem', marginTop: '-1rem', color: '#ed6c02'}}>
                      Кол-во повторов: {ovenStore.repeat}
                      </span>
                      <Slider
                        sx={{maxWidth: '250px'}}
                        aria-label='Volume'
                        max={10}
                        min={1}
                        color='success'
                        value={ovenStore.repeat}
                        onChange={handleChangeRepeat}
                      />
                    </div>
                  ) : (
                    <></>
                  )}
        </List>
        <Modal
          open={modalComplete}
          onClose={closeModalComplete}
          aria-labelledby='modal-modal-title'
          aria-describedby='modal-modal-description'
        >
          <Box
            sx={{
              position: 'absolute',
              top: '40%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              bgcolor: 'background.paper',
              border: '4px solid #2e7d32',
              p: 1,
              borderRadius: '7px'
            }}
            onClick={closeModalComplete}
          >
            <Typography
              id='modal-modal-title'
              variant='h6'
              component='h2'
              sx={{ padding: '15px 20px', whiteSpace: 'nowrap' }}
            >
              {'Процесс завершен!'}
            </Typography>
          </Box>
        </Modal>
        <Modal
          open={modalErrors}
          onClose={() => {
            setModalErrors(false)
          }}
          aria-labelledby='modal-modal-title'
          aria-describedby='modal-modal-description'
        >
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              bgcolor: 'background.paper',
              // eslint-disable-next-line no-extra-boolean-cast
              border: `4px solid ${!!(ovenStore.stat & (1 << 1)) ? '#cc2c2cfa' : '#ed6c02'}`,
              p: 1,
              borderRadius: '7px'
            }}
            onClick={() => {
              setModalErrors(false)
            }}
          >
            <Typography
              id='modal-modal-title'
              variant='h6'
              component='h2'
              sx={{ padding: '0px 20px', whiteSpace: 'nowrap' }}
            >
              {ovenStore.i.door ? (
                <>
                  <span
                    style={{
                      color: '#ed6c02',
                      width: '100%',
                      display: 'inline-block',
                      textAlign: 'center',
                      fontSize: '16px'
                    }}
                  >
                    Открыта дверь!
                  </span>{' '}
                  <br />
                </>
              ) : (
                <></>
              )}

              <span style={{ fontSize: '16px' }}>
                Ошибки профиля:{' ' + ovenStore.errorStore.profileError}
              </span>
              <br />
              <span style={{ fontSize: '16px' }}>
                Ошибки вентилятора:{' ' + ovenStore.errorStore.fanError}
              </span>
              <br />
              <span style={{ fontSize: '16px' }}>
                Ошибки двери:{' ' + ovenStore.errorStore.doorError}
              </span>
              <br />
              <span style={{ fontSize: '16px' }}>
                Ошибки темп:{' ' + ovenStore.errorStore.ovenTempError}
              </span>
              <br />
              {ovenStore.errorStore.itmpError ? (
                <>
                  <span style={{ fontSize: '16px' }}>
                    Ошибки связи:{' ' + ovenStore.errorStore.itmpError}
                  </span>
                  <br />
                </>
              ) : (
                <></>
              )}
              {
                // eslint-disable-next-line no-extra-boolean-cast
                !!(ovenStore.stat & (1 << 6)) ? (
                  <>
                    <span
                      style={{
                        color: '#cc2c2cfa',
                        width: '100%',
                        display: 'inline-block',
                        textAlign: 'center',
                        fontSize: '16px'
                      }}
                    >
                      Авария!
                    </span>{' '}
                    <br />
                  </>
                ) : (
                  <></>
                )
              }
              {
                // eslint-disable-next-line no-extra-boolean-cast
                !!(ovenStore.stat & (1 << 7)) ? (
                  <>
                    <span
                      style={{
                        color: '#ed6c02',
                        width: '100%',
                        display: 'inline-block',
                        textAlign: 'center',
                        fontSize: '16px'
                      }}
                    >
                      Сбой питания печи!
                    </span>{' '}
                    <br />
                  </>
                ) : (
                  <></>
                )
              }
            </Typography>
          </Box>
        </Modal>
      </Dialog>
    )
  }
)
