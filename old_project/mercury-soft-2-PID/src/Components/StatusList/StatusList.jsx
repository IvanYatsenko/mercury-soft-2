import React from 'react'
import { StatusItem } from '../StatusItem/StatusItem'
import { observer } from 'mobx-react-lite'
import DeviceThermostatIcon from '@mui/icons-material/DeviceThermostat'
// import CycloneIcon from '@mui/icons-material/Cyclone'
import { FanConvq } from '../../assets/icons/FanConvq'
import SsidChartIcon from '@mui/icons-material/SsidChart';
import InsightsIcon from '@mui/icons-material/Insights';
export const StatusList = observer(
  ({
    ovenTemp,
    ovenFanSpeed,
    timeHorizon,
    errors,
    status,
    onBoard = false,
    debugMode = false,
    deviationProfileSheldule = 0,
    deviationProfileShelduleMax = 0
  }) => {
    const toTime = (timeHorizon) => {
      return `${Math.floor(timeHorizon / 60)
        .toString()
        .padStart(2, '0')}
                  :
                  ${(Math.floor(timeHorizon) % 60).toString().padStart(2, '0')}`
    }

    if (debugMode) {
      return (
        <>
          <StatusItem
            name={
              <span style={{ position: 'relative' }}>
                <DeviceThermostatIcon
                  color='success'
                  sx={{ fontSize: '20px', mb: '-5px' }}
                />
                <span
                  style={{
                    fontSize: '8px',
                    fontWeight: '600',
                    position: 'absolute',
                    top: '-4px',
                    right: '0'
                  }}
                >
                  1
                </span>
              </span>
            }
            value={ovenTemp.t1 + '°'}
          />
          <StatusItem
            name={
              <span style={{ position: 'relative' }}>
                <DeviceThermostatIcon
                  color='success'
                  sx={{ fontSize: '20px', mb: '-5px' }}
                />
                <span
                  style={{
                    fontSize: '8px',
                    fontWeight: '600',
                    position: 'absolute',
                    top: '-4px',
                    right: '0'
                  }}
                >
                  2
                </span>
              </span>
            }
            value={ovenTemp.t2 + '°'}
          />
          <StatusItem name={<FanConvq green />} value={ovenFanSpeed + ''} />
          <StatusItem name={<SsidChartIcon color='success' sx={{ fontSize: '20px', mb: '-5px' }} />} value={deviationProfileSheldule + '°'} />
          <StatusItem name={
            <span style={{ position: 'relative' }}>
              <InsightsIcon
                color='success'
                sx={{ fontSize: '20px', mb: '-5px' }}
              />
              <span
                style={{
                  fontSize: '8px',
                  fontWeight: '600',
                  position: 'absolute',
                  top: '-4px',
                  right: '-5px'
                }}
              >
                max
              </span>
            </span>
          }
            value={deviationProfileShelduleMax + '°'}
          />
          {status === 'idle' ? (
            ''
          ) : (
            <StatusItem
              name={'Осталось: '}
              value={
                <span style={{ fontSize: '18px' }}>{toTime(timeHorizon)}</span>
              }
            />
          )}
        </>
      )
    } else {
      return (
        <>
          <StatusItem
            name={''}
            value={onBoard ? ovenTemp.t1 + '°C' : ovenTemp.t2 + '°C'}
            tempItem={true}
          />
          {status === 'idle' ? (
            ''
          ) : (
            <StatusItem
              name={'Осталось: '}
              value={
                <span style={{ fontSize: '18px' }}>{toTime(timeHorizon)}</span>
              }
            />
          )}
          {status === 'busy' && errors.fanError > 5 ? (
            <>
              <StatusItem
                name={'Вент-р: '}
                value={ovenFanSpeed + ' (об/мин)'}
                warning={true}
              />
            </>
          ) : (
            <></>
          )}

          {/* {ovenIP && <StatusItem name={'IP адрес:'} value={ovenIP} />} */}
        </>
      )
    }
  }
)
