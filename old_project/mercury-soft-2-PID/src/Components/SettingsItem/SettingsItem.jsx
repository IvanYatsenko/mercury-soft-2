import React, { useEffect, useState } from 'react'
import Divider from '@mui/material/Divider'
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  AppBar,
  Button,
  Dialog,
  FormControlLabel,
  FormGroup,
  IconButton,
  Input,
  List,
  ListItem,
  Switch,
  TextField,
  Toolbar,
  Typography
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import CloseIcon from '@mui/icons-material/Close'
import LockIcon from '@mui/icons-material/Lock'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import { KeyboardNumeric } from '../UI/KeyboardNumeric/KeyboardNumeric'
import styles from './SettingsItem.module.css'
import { observer } from 'mobx-react-lite'
import { CalibrateDialog } from '../CalibrateDialog/CalibrateDialog'

export const SettingsItem = observer(
  ({
    ovenStore,
    accordionEnable,
    setAccordionEnable,
    accordionOpen,
    setAccordionOpen
  }) => {
    const [openModal, setOpenModal] = useState(false)
    const [openModalCalib, setOpenModalCalib] = useState(false)
    const [passValue, setPassValue] = useState(``)
    const [convValue, setConvValue] = useState(`${ovenStore.fanTarget}`)
    const [showFullSettings, setShowFullSettings] = useState(false)
    const [visibleNumericKey, setVisibleNumericKey] = useState(false)
    const [isVersion400, setIsVersion400] = useState(false)

    const openModalCalibHandler = () => {
      ovenStore.setTesterMode(true)
      setOpenModalCalib(false)
    }

    useEffect(() => {
      setConvValue(`${ovenStore.fanTarget}`)
    }, [ovenStore.fanTarget])

    useEffect(() => {
      setIsVersion400(ovenStore.mercuryType === '400')
    }, [ovenStore.mercuryType])

    const openModalHandler = (value) => {
      setOpenModal(value)
    }

    const handleClose = () => {
      openModalHandler(false)
      setPassValue('')
    }

    const onKeyPressConv = (button) => {
      if (button == '&#9003;') {
        setConvValue(convValue.slice(0, -1))
      }
      if (button == '{enter}') {
        ovenStore.setFanTarget(convValue)
        setTimeout(() => {
          setVisibleNumericKey(false)
        }, 300)
      }
      if (button !== '&#9003;' && button !== '{enter}') {
        if (button === '.' && convValue.includes('.')) {
          return
        } else {
          setConvValue(`${convValue}${button}`)
        }
      }
    }

    const onKeyPressPass = (button) => {
      if (button == '&#9003;') {
        setPassValue(passValue.slice(0, -1))
      }
      if (button == '{enter}') {
        if (passValue === '3457') {
          setAccordionEnable(false)
          setShowFullSettings(false)
          ovenStore.setTesterMode(true)
        }
        if (passValue === '34572') {
          setShowFullSettings(true)
          setAccordionEnable(false)
          ovenStore.setTesterMode(true)
        }
        setPassValue('')
        openModalHandler(false)
      }
      if (button !== '&#9003;' && button !== '{enter}') {
        if (button === '.' && passValue.includes('.')) {
          return
        } else {
          setPassValue(`${passValue}${button}`)
        }
      }
    }

    return (
      <>
        <Accordion
          disabled={accordionEnable}
          className={styles.settings_item}
          expanded={accordionOpen}
        >
          <AccordionSummary
            onClick={() => {
              if (!accordionEnable) {
                setAccordionOpen(!accordionOpen)
              }
            }}
            expandIcon={accordionEnable ? '' : <ExpandMoreIcon />}
          >
            <div className={styles.name}>
              <span>
                <b>{'Настройки'}</b>
              </span>
              <div className={styles.lock_btn}>
                <IconButton
                  style={{ marginRight: 2 }}
                  aria-label='LockIcon'
                  onClick={(e) => {
                    e.stopPropagation()
                    if (accordionEnable) {
                      setOpenModal(true)
                    } else {
                      setAccordionEnable(true)
                      setShowFullSettings(false)
                      setAccordionOpen(false)
                      ovenStore.setTesterMode(false)
                    }
                  }}
                >
                  {accordionEnable ? (
                    <LockIcon color='success' />
                  ) : (
                    <LockOpenIcon color='success' />
                  )}
                </IconButton>
              </div>
            </div>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant='span' component='span'>
              Температура Pi {` ${(ovenStore.coreTemp / 1000).toFixed(0)}°С`}
            </Typography>
            <br />
            <FormGroup>
              <FormControlLabel
                control={
                  <Switch
                    color='success'
                    checked={ovenStore.indicators.i5}
                    onClick={() => {
                      ovenStore.indicators.i5
                        ? ovenStore.funOffPi()
                        : ovenStore.funOnPi()
                      ovenStore.setIndicatorWithCancel(
                        'i5',
                        !ovenStore.indicators.i5
                      )
                    }}
                  />
                }
                label={'Вентилятор Pi'}
              />

              <Typography variant='span' component='span'>
                Контроллер {` ${ovenStore.temperature.t7}°С`}
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    color='success'
                    checked={ovenStore.indicators.i6}
                    onClick={() => {
                      ovenStore.setIndicatorWithCancel(
                        'i6',
                        !ovenStore.indicators.i6
                      )
                    }}
                  />
                }
                label={'Вентилятор контроллера'}
              />
              <Typography variant='span' component='span'>
                Дверь: {` ${ovenStore.i.door ? 'Открыта' : 'Закрыта'}`}
              </Typography>
              <FormControlLabel
                control={
                  <Switch
                    color='success'
                    checked={ovenStore.heaters.topHeater}
                    onClick={() => {
                      ovenStore.setHeaterOnTest({
                        topHeater: !ovenStore.heaters.topHeater
                      })
                    }}
                  />
                }
                label={'Верхний нагреватель'}
              />
              <FormControlLabel
                control={
                  <Switch
                    color='success'
                    checked={ovenStore.heaters.bottomHeater}
                    onClick={() => {
                      ovenStore.setHeaterOnTest({
                        bottomHeater: !ovenStore.heaters.bottomHeater
                      })
                    }}
                  />
                }
                label={'Нижний нагреватель'}
              />
              <FormControlLabel
                control={
                  <Switch
                    color='success'
                    checked={ovenStore.heaters.convection}
                    onClick={() => {
                      ovenStore.setHeaterOnTest({
                        convection: !ovenStore.heaters.convection
                      })
                    }}
                  />
                }
                label={'Конвекц. Вентилятор'}
              />
              <Divider sx={{ margin: '5px 0 10px 0' }} />
              <span>
                Текущая частота {ovenStore.convFreqSpeed} Hz. (
                {((ovenStore.convFreqSpeed / convValue) * 100).toFixed()} %)
              </span>
              <br />
              <FormControlLabel
                // labelPlacement='start'
                control={
                  <TextField
                    value={convValue}
                    sx={{ maxWidth: '50px' }}
                    size='small'
                  />
                }
                onFocus={() => {
                  setVisibleNumericKey(true)
                }}
                label={
                  <span style={{ paddingLeft: '15px' }}>Эталонная частота</span>
                }
              />
              <Divider sx={{ margin: '10px 0 5px 0' }} />
              {visibleNumericKey && (
                <Typography variant='span' component='span'>
                  <KeyboardNumeric
                    onKeyPress={onKeyPressConv}
                    isStyle={false}
                  />
                </Typography>
              )}
              <FormControlLabel
                control={
                  <Switch
                    color='success'
                    checked={ovenStore.heaters.infrared}
                    onClick={() => {
                      console.log(ovenStore.heaters.infrared)
                      ovenStore.setHeaterOnTest({
                        infrared: !ovenStore.heaters.infrared
                      })
                    }}
                  />
                }
                label={'Инфракрасная лампа №1'}
              />
              <FormControlLabel
                control={
                  <Switch
                    color='success'
                    checked={ovenStore.heaters.infrared2}
                    onClick={() => {
                      ovenStore.setHeaterOnTest({
                        infrared2: !ovenStore.heaters.infrared2
                      })
                    }}
                  />
                }
                label={'Инфракрасная лампа №2'}
              />
              {isVersion400 ? (
                <FormControlLabel
                  control={
                    <Switch
                      color='success'
                      checked={ovenStore.heaters.infrared3}
                      onClick={() => {
                        ovenStore.setHeaterOnTest({
                          infrared3: !ovenStore.heaters.infrared3
                        })
                      }}
                    />
                  }
                  label={'Инфракрасная лампа №3'}
                />
              ) : (
                <></>
              )}
              <FormControlLabel
                control={
                  <Switch
                    color='success'
                    checked={ovenStore.heaters.f1}
                    onClick={() => {
                      ovenStore.setHeaterOnTest({
                        f1: !ovenStore.heaters.f1
                      })
                    }}
                  />
                }
                label={'Вентилятор охлаждения'}
              />
              {isVersion400 ? (
                <></>
              ) : (
                <FormControlLabel
                  control={
                    <Switch
                      color='success'
                      checked={ovenStore.heaters.f2}
                      onClick={() => {
                        ovenStore.setHeaterOnTest({
                          f2: !ovenStore.heaters.f2
                        })
                      }}
                    />
                  }
                  label={'Вентилятор охлаждения 2'}
                />
              )}
              <FormControlLabel
                control={
                  <Switch
                    color='success'
                    checked={ovenStore.errorOnFan}
                    onClick={() => {
                      ovenStore.switchErrorOnFan()
                    }}
                  />
                }
                label={'Реагировать на ошибку оборотов'}
              />
              <FormControlLabel
                control={
                  <Switch
                    color='success'
                    checked={ovenStore.soundOnErrors}
                    onClick={() => {
                      ovenStore.switchSoundOnErrors()
                    }}
                  />
                }
                label={'Звук об ошибках'}
              />
              {showFullSettings && (
                <>
                  <FormControlLabel
                    control={
                      <Switch
                        onClick={() => ovenStore.switchDebugMode()}
                        checked={ovenStore.debugMode}
                        color='success'
                      />
                    }
                    label={'Режим отладки'}
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        color='success'
                        checked={ovenStore.thermalProtection}
                        onClick={() => ovenStore.switchThermalProtection()}
                      />
                    }
                    label={'Термозащита'}
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        color='success'
                        checked={ovenStore.thermocoupleCorrection}
                        onClick={() => ovenStore.switchThermocoupleCorrection()}
                      />
                    }
                    label={'Коррекция задней термопары'}
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        color='success'
                        checked={ovenStore.mercuryType == 400}
                        onClick={() => {
                          ovenStore.switchMercuryType()
                        }}
                      />
                    }
                    label={`v${ovenStore.mercuryType}`}
                  />
                </>
              )}
              <Button
                type='button'
                sx={{ mb: 1 }}
                onClick={() => {
                  ovenStore.setTesterMode(false)
                  setOpenModalCalib(true)
                }}
                variant='outlined'
                color='warning'
              >
                Калибровка печи
              </Button>
              <br />
              <div style={{border: '1px solid #999', padding: '5px', borderRadius: '4px'}}>
                <div style={{marginBottom: '5px'}}>
                  Время работы:{' '}
                  {`${Math.floor(
                    ovenStore.totalTime.time / (3600 * 24)
                  )}д ${Math.floor(
                    (ovenStore.totalTime.time / 3600) % 24
                  )}ч ${Math.floor((ovenStore.totalTime.time / 60) % 60)}м`}
                </div>
                <div>Кол-во включений: {`${ovenStore.totalTime.start}`}</div>
              </div>
            </FormGroup>
          </AccordionDetails>
        </Accordion>
        <Dialog fullScreen open={openModal} onClose={handleClose}>
          <AppBar sx={{ position: 'relative' }} color='transparent'>
            <Toolbar>
              <Typography sx={{ ml: 2, flex: 1 }} variant='h6' component='div'>
                {'Введите пароль'}
              </Typography>
              <IconButton
                edge='start'
                color='inherit'
                onClick={handleClose}
                aria-label='close'
              >
                <CloseIcon />
              </IconButton>
            </Toolbar>
          </AppBar>
          <List>
            <ListItem style={{ height: '80vh', alignItems: 'flex-start' }}>
              <Input
                color='success'
                readOnly={true}
                value={passValue}
                type='text'
                style={{ width: '100%' }}
              />
              <KeyboardNumeric onKeyPress={onKeyPressPass} />
            </ListItem>
          </List>
        </Dialog>
        <CalibrateDialog
          ovenStore={ovenStore}
          openModalCalibHandler={openModalCalibHandler}
          openModalCalib={openModalCalib}
          showFullSettings={showFullSettings}
        />
      </>
    )
  }
)
