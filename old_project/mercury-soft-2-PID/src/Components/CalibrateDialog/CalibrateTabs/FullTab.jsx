import { Button, List, ListItem } from '@mui/material'
import { observer } from 'mobx-react-lite'
import { useEffect, useState } from 'react'

export const FullTab = observer(
  ({ disabledBtns, ovenStore, setDisabledBtns }) => {
    const [errorCalibrate, setError] = useState(false)
    const [temp, setTemp] = useState(60)
    const [flagToNext, setNext] = useState(true)

    useEffect(() => {
      if (ovenStore.errorFlag) {
        ovenStore.closeProgressPage()
        setDisabledBtns(false)
        setError(true)
      }
    }, [ovenStore, ovenStore.errorFlag])

    useEffect(() => {
      if (ovenStore.state == 'finish') {
        if (temp == 260) {
          ovenStore.closeProgressPage()
          setDisabledBtns(false)
        } else {
          if (flagToNext) {
            setNext(false)
            setTimeout(() => {
              ovenStore.closeProgressPage()
              setTimeout(() => {
                ovenStore.startToCalibrate(temp + 20)
                setNext(true)
              }, 1000)
              setTemp(temp + 20)
            }, 5000)
          }
        }
      }
    }, [ovenStore.state])

    return (
      <>
        {errorCalibrate ? (
          <List>
            <ListItem>Произошла ошибка, проверьте оборудование.</ListItem>
          </List>
        ) : (
          <List>
            <ListItem>
              <div>
                <div>
                  <div style={{ textAlign: 'center' }}>
                    Текущая температура:{' '}
                    <b style={{ marginLeft: '5px' }}>
                      {` ${ovenStore.temperature.t2}`} °С
                    </b>
                  </div>
                  <hr />
                  <div
                    style={{
                      color: 'red',
                      textAlign: 'center',
                      fontWeight: 500
                    }}
                  >
                    <span>Внимание!</span>
                  </div>
                  <br />
                  Будет нагрев от 60°С до 260°С!
                  <br />
                 С интервалами 20°С будут подаваться сигналы оповещения для записи
                  данных с измерителя!
                </div>
                {/* <br />
                  Температура печи: °С
                  <br/>
                  Состояние: Идет нагрев */}
                <div style={{ textAlign: 'center' }}>
                  <br />
                  <Button
                    disabled={disabledBtns}
                    variant='outlined'
                    color='success'
                    onClick={() => {
                      setDisabledBtns(true)
                      ovenStore.startToCalibrate(temp)
                    }}
                  >
                    Запустить процесс
                  </Button>
                  <Button
                    sx={{ ml: 2 }}
                    disabled={!disabledBtns}
                    variant='outlined'
                    color='warning'
                    onClick={() => {
                      setDisabledBtns(false)
                      ovenStore.closeProgressPage()
                    }}
                  >
                    Остановить процесс
                  </Button>
                </div>
              </div>
            </ListItem>
          </List>
        )}
      </>
    )
  }
)
