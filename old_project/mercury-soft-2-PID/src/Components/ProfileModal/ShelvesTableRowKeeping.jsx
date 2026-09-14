import { TableCell, TableRow } from '@mui/material'
import { observer } from 'mobx-react-lite'
import { ShelvesTemperatureTableCell } from './ShelvesTemperatureTableCell'
import { ShelvesSecondTableCell } from './ShelvesSecondTableCell'

export const ShelvesTableRowKeeping = observer(
  ({ shelves, setTemperatureValue, setSecondValue }) => {
    return (
      <TableRow>
        <TableCell>Выдерживание</TableCell>
        
        <ShelvesSecondTableCell
          secondValue={shelves[0].second}
          setSecondValue={(value) => {
            setSecondValue(value, 0)
          }}
        />

        <ShelvesTemperatureTableCell
          temperatureValue={shelves[0].temperature}
          setTemperatureValue={(value) => {
            setTemperatureValue(value, 0)
          }}
        />
      </TableRow>
    )
  },
)
