import React from 'react'
import {
  Button,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material'
import AddCircleIcon from '@mui/icons-material/AddCircle'
import { PointsTableRow } from './PointsTableRow'
import { observer } from 'mobx-react-lite'

export const PointsTable = observer(
  ({ points, setPoints, board, setBoard, thermalProtection }) => {
    const changeboard = () => {
      setBoard(!board)
    }

    const setSecondValue = (value, index) => {
      const newPoints = points
      newPoints[index] = {
        temperature: newPoints[index].temperature,
        second: value,
      }
      setPoints([...newPoints])
    }

    const setTemperatureValue = (value, index) => {
      let newTemp = value
      const maxTemp = thermalProtection ? 280 : 330
  
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
    const addRow = () => {
      setPoints([...points, { temperature: 0, second: 0 }])
    }

    return (
      <TableContainer component={Paper}>
        <Table aria-label="simple table">
          <TableHead>
            <TableRow>
              <TableCell align="center">Время</TableCell>
              <TableCell align="center">Темп-ра °C</TableCell>
              <TableCell align="center">Опции</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {points.map((point, index) => {
              return (
                <PointsTableRow
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
                '&:last-child td, &:last-child th': { border: 0 },
              }}
            >
              <TableCell colSpan={3}>
                <Button
                  variant="outlined"
                  color="success"
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
                '&:last-child td, &:last-child th': { border: 0 },
              }}
            >
              <TableCell colSpan={3}>
                <FormGroup>
                  <FormControlLabel
                    control={
                      <Checkbox
                        onChange={changeboard}
                        checked={board}
                        color="success"
                      />
                    }
                    label={'Использовать датчик на плате'}
                  />
                </FormGroup>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    )
  },
)
