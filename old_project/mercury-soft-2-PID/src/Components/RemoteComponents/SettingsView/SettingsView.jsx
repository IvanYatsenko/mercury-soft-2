import {
  Box,
  Divider,
  FormControlLabel,
  FormGroup,
  Grid,
  Switch,
  TextField,
  Typography
} from '@mui/material'
import React from 'react'
import { observer } from 'mobx-react-lite'

export const SettingsView = observer(
  ({
    isActive,
    ovenStore,
    disabled,
    thermalProtection,
    fanTarget,
    thermocoupleCorrection
  }) => {
    const onChangeFanValue = (e) => {
      ovenStore.setFanTarget(e.target.value)
    }

    return (
      <Grid
        className={
          isActive ? 'SettingsView SettingsView--active' : 'SettingsView'
        }
        item
        xs={12}
        md={6}
        sx={{ mt: 1 }}
      >
        <Typography color='#2e7d32' variant='h6' component='div' sx={{ ml: 1 }}>
          Настройки
        </Typography>
        <Divider sx={{ pb: 1 }} />
        {!disabled ? (
          <Box sx={{ m: 1 }}>
            <FormGroup>
              <span>
                Обороты вентилятора: {ovenStore.convFreqSpeed} об.мин. (
                {((ovenStore.convFreqSpeed / fanTarget) * 100).toFixed()} %)
              </span>
              <FormControlLabel
                control={
                  <TextField
                    value={fanTarget}
                    sx={{ maxWidth: '70px', ml: 2 }}
                    size='small'
                    color='success'
                    onChange={onChangeFanValue}
                  />
                }
                label={
                  <span style={{ paddingLeft: '15px' }}>Эталонная частота</span>
                }
              />
              <Divider sx={{ margin: '10px 0 5px 0' }} />
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
              <FormControlLabel
                control={
                  <Switch
                    color='success'
                    checked={thermalProtection}
                    onClick={() => ovenStore.switchThermalProtection()}
                  />
                }
                label={'Термозащита'}
              />
              <FormControlLabel
                control={
                  <Switch
                    color='success'
                    checked={thermocoupleCorrection}
                    onClick={() => ovenStore.switchThermocoupleCorrection()}
                  />
                }
                label={'Коррекция задней термопары'}
              />
              {/* <FormControlLabel
                        control={<Switch color="success" />}
                        label={'Показывать отклонение от графика'}
                      />*/}
            </FormGroup>
          </Box>
        ) : (
          <>Настройки недоступны при выполнеии профиля</>
        )}
      </Grid>
    )
  }
)
