import {
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material'
import AddCircleIcon from '@mui/icons-material/AddCircle'
import React from 'react'
import { ManualModeRow } from './ManualModeRow'
import { observer } from 'mobx-react-lite'

export const ManualModeTable = observer(
  ({
    points = [],
    setPoints,
    setSecondValue,
    setTemperatureValue,
    toggleUpPoint,
    toggleDownPoint,
    removePoint
  }) => {
    const addRow = () => {
      setPoints([...points, { temperature: 0, second: 0 }])
    }

    return (
      <TableContainer component={Paper}>
        <Table aria-label='simple table'>
          <TableHead>
            <TableRow>
              <TableCell align='left'>Время</TableCell>
              <TableCell align='left'>Темп-ра °C</TableCell>
              <TableCell align='right'>Опции</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {points.map((point, index) => {
              return (
                <ManualModeRow
                  key={index}
                  point={point}
                  index={index}
                  setSecondValue={setSecondValue}
                  setTemperatureValue={setTemperatureValue}
                  toggleUpPoint={toggleUpPoint}
                  removePoint={removePoint}
                  points={points}
                  toggleDownPoint={toggleDownPoint}
                />
              )
            })}
            <TableRow
              key={'add-row'}
              sx={{
                '&:last-child td, &:last-child th': { border: 0 }
              }}
            >
              <TableCell colSpan={3} sx={{ textAlign: 'center' }}>
                <Button
                  variant='outlined'
                  color='success'
                  startIcon={<AddCircleIcon />}
                  onClick={addRow}
                >
                  Добавить строку
                </Button>
              </TableCell>
            </TableRow>
            <TableRow
              key={'end-row'}
              sx={{
                '&:last-child td, &:last-child th': { border: 0 }
              }}
            ></TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    )
  }
)
