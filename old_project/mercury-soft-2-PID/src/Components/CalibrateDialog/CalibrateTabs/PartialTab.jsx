import { Button, Input, List, ListItem, Slider } from '@mui/material'
import { observer } from 'mobx-react-lite'
import { useEffect, useState } from 'react'
import { DialogModalKeyboardNumeric } from '../../UI/DialogModalKeyboardNumeric/DialogModalKeyboardNumeric'

const marks = []
for (let i = 60; i < 261; i = i + 40) {
  marks.push({
    value: i,
    label: `${i}°C`
  })
}

export const PartialTab = observer(
  ({ ovenStore, disabledBtns, setDisabledBtns }) => {
    const [t, setT] = useState(150)
    const [valueTemp, setValueTemp] = useState(t)
    const [openModal, setOpenModal] = useState(false)
    const [errorCalibrate, setError] = useState(false)

    const valuetext = (value) => {
      return `${value}°C`
    }

    useEffect(() => {
      if (ovenStore.errorFlag) {
        ovenStore.closeProgressPage()
        setDisabledBtns(false)
        setError(true)
      }
    }, [ovenStore, ovenStore.errorFlag])

    const changeValue = (value) => {
      if (value > t - 20 && value < t + 20) {
        setValueTemp(value)
      } else {
        setValueTemp(t)
      }
      setOpenModal(false)
    }

    return (
      <>
        {!errorCalibrate ? (
          <List>
            <ListItem>
              Текущая температура:{' '}
              <b style={{ marginLeft: '5px' }}>
                {` ${ovenStore.temperature.t2}`} °С
              </b>
            </ListItem>
            <ListItem sx={{ mb: '-15px' }}>
              Требуемая температура калибровки: {t} °С
            </ListItem>
            <br />
            {!disabledBtns ? (
              <ListItem sx={{ ml: 2 }}>
                <Slider
                  sx={{ mr: 3 }}
                  color='success'
                  aria-label='Custom marks'
                  min={60}
                  max={260}
                  getAriaValueText={valuetext}
                  step={5}
                  valueLabelDisplay='auto'
                  marks={marks}
                  value={t}
                  onChange={(_, v) => {
                    setT(v)
                    setValueTemp(v)
                  }}
                />
              </ListItem>
            ) : (
              <ListItem sx={{ alignItems: 'end' }}>
                Состояние:
                {ovenStore.state == 'finish' ? ' Готово' : ''}
                {ovenStore.state == 'busy'
                  ? ' Идет нагрев, стабилизация температуры...'
                  : ''}
                <br />
                <br />
                {ovenStore.state == 'finish' ? (
                  <>
                    {' '}
                    Введите фактическую температуру измерителя:
                    <Input
                      disabled={ovenStore.state != 'finish'}
                      sx={{ ml: 1, width: '45px', pl: 1, alignSelf: 'end' }}
                      value={valueTemp}
                      onClick={() => {
                        setOpenModal(true)
                      }}
                      onChange={() => {}}
                    />
                    <span>°С</span>
                  </>
                ) : (
                  <br />
                )}
              </ListItem>
            )}

            {/* <ListItem>
                              
                             </ListItem> */}
            <ListItem
              sx={{
                alignItems: 'center',
                display: 'flex',
                justifyContent: 'space-around'
              }}
            >
              <Button
                disabled={disabledBtns}
                variant='outlined'
                color='warning'
                onClick={() => {
                  setDisabledBtns(true)
                  ovenStore.startToCalibrate(t)
                }}
              >
                Запустить процесс
              </Button>
              <Button
                disabled={ovenStore.state != 'finish'}
                variant='outlined'
                color='success'
                onClick={() => {
                  ovenStore.closeProgressPage()
                  ovenStore.clearCriticalError()
                  const newCoef = (valueTemp / t).toFixed(3)
                  ovenStore.calibratePoint({ temp: t, coef: newCoef })
                  setDisabledBtns(false)
                }}
              >
                Сохранить
              </Button>
              {/* <Button disabled={!disabledBtns} variant='outlined' color='error'>
                                 Сбросить
                               </Button> */}
            </ListItem>
          </List>
        ) : (
          <List>
            <ListItem>Произошла ошибка, проверьте оборудование.</ListItem>
          </List>
        )}

        {openModal && (
          <DialogModalKeyboardNumeric
            openModal={openModal}
            openModalHandler={setOpenModal}
            enableHandler={changeValue}
            value={valueTemp}
          />
        )}
      </>
    )
  }
)
