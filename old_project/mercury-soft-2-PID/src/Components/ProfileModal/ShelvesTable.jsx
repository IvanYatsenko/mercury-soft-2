import { Checkbox, FormControlLabel, FormGroup, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material'
import { observer } from 'mobx-react-lite'
import { ShelvesTableRowCooling } from './ShelvesTableRowCooling'
import { ShelvesTableRowKeeping } from './ShelvesTableRowKeeping'
import { ShelvesTableRowMelting } from './ShelvesTableRowMelting'

export const ShelvesTable = observer(({ shelves, setShelves, updatePointsByShelves, setPoints, board, setBoard, thermalProtection }) => {
  const setSecondValue = (value, index) => {
    const newShelves = shelves
    newShelves[index] = {
      temperature: newShelves[index].temperature,
      second: value,
    }
    setPoints([...updatePointsByShelves(shelves)])
    setShelves([...newShelves])
  }

  const changeboard = () => {
    setBoard(!board)
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

    const newShelves = shelves
    newShelves[index] = { temperature: newTemp, second: newShelves[index].second }
    setShelves([...newShelves])
    setPoints([...updatePointsByShelves(shelves)])
  }

  return (
    <Table basic="very" className="border-none">
      <TableHead>
        <TableRow>
          <TableCell />
          <TableCell>Время</TableCell>
          <TableCell>Темп-ра</TableCell>
          <TableCell />
        </TableRow>
      </TableHead>
      <TableBody>
        <ShelvesTableRowKeeping
          shelves={shelves}
          setSecondValue={setSecondValue}
          setTemperatureValue={setTemperatureValue}
        />
        <ShelvesTableRowMelting
          shelves={shelves}
          setSecondValue={setSecondValue}
          setTemperatureValue={setTemperatureValue}
        />
        <ShelvesTableRowCooling
          shelves={shelves}
          setTemperatureValue={setTemperatureValue}
        />
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
  )
})
