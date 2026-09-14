import { TableCell, TableRow } from '@mui/material'
import { observer } from 'mobx-react-lite'
import { ShelvesSecondTableCell } from './ShelvesSecondTableCell'
import { ShelvesTemperatureTableCell } from './ShelvesTemperatureTableCell'

export const ShelvesTableRowMelting = observer(({ shelves, setSecondValue, setTemperatureValue}) => {
  return (
    <TableRow>
      <TableCell>Плавление</TableCell>
     <ShelvesSecondTableCell
              secondValue={shelves[1].second}
              setSecondValue={(value) => {
                setSecondValue(value, 1)
              }}
            />
    
            <ShelvesTemperatureTableCell
              temperatureValue={shelves[1].temperature}
              setTemperatureValue={(value) => {
                setTemperatureValue(value, 1)
              }}
            />
    </TableRow>
  )
})
