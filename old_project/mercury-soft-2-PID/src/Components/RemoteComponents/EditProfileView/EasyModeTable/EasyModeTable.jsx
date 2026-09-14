import {
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow
} from '@mui/material'
import { observer } from 'mobx-react-lite'
import React, { useEffect, useState } from 'react'

export const EasyModeTable = observer(
  ({
    shelves,
    setShelves,
    updatePointsByShelves,
    setPoints,
    thermalProtection
  }) => {
    let timeout1, timeout2, timeout3
    const [tempValue1, setTempValue1] = useState(shelves[0].temperature)
    const [tempValue2, setTempValue2] = useState(shelves[1].temperature)
    const [tempValue3, setTempValue3] = useState(shelves[2].temperature)

    useEffect(() => {
      useState(shelves[0].temperature)
      useState(shelves[1].temperature)
      useState(shelves[2].temperature)
    }, [shelves[0].temperature, shelves[1].temperature, shelves[2].temperature])

    const setSecondValue = (value, index) => {
      const newShelves = shelves
      newShelves[index] = {
        temperature: newShelves[index].temperature,
        second: value
      }
      setPoints([...updatePointsByShelves(shelves)])
      setShelves([...newShelves])
    }

    const setTemperatureValue = (value, index) => {
      let newTemp = value
      const maxTemp = thermalProtection ? 280 : 330

      if (value > maxTemp) {
        newTemp = maxTemp
      }
      if (value < 30) {
        newTemp = 30
      }
      const newShelves = shelves
      newShelves[index] = {
        temperature: newTemp,
        second: newShelves[index].second
      }
      setShelves([...newShelves])
      setPoints([...updatePointsByShelves(shelves)])
    }
    return (
      <Table basic='very' className='border-none'>
        <TableHead>
          <TableRow>
            <TableCell />
            <TableCell>Время</TableCell>
            <TableCell>Темп-ра</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>Выдерживание</TableCell>
            <TableCell>
              <Input
                value={shelves[0].second}
                onChange={(e) => setSecondValue(e.target.value, 0)}
              />
            </TableCell>
            <TableCell>
              <Input
                value={tempValue1}
                onChange={(e) => {
                  setTempValue1(e.target.value)
                  clearTimeout(timeout1)
                  timeout1 = setTimeout(() => {
                    setTemperatureValue(e.target.value, 0)
                  }, 1000)
                }}
              />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Плавление</TableCell>
            <TableCell>
              <Input
                value={shelves[1].second}
                onChange={(e) => setSecondValue(e.target.value, 1)}
              />
            </TableCell>
            <TableCell>
              <Input
                value={tempValue2}
                onChange={(e) => {
                  setTempValue2(e.target.value)
                  clearTimeout(timeout2)
                  timeout2 = setTimeout(() => {
                    setTemperatureValue(e.target.value, 1)
                  }, 1000)
                }}
              />
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Охлаждение</TableCell>
            <TableCell></TableCell>
            <TableCell>
              <Input
                value={tempValue3}
                onChange={(e) => {
                  setTempValue3(e.target.value)
                  clearTimeout(timeout3)
                  timeout3 = setTimeout(() => {
                    setTemperatureValue(e.target.value, 2)
                  }, 1000)
                }}
              />
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
    )
  }
)
