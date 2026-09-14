import { TableCell, TableRow } from '@mui/material'
import { observer } from 'mobx-react-lite'
import { ShelvesTemperatureTableCell } from './ShelvesTemperatureTableCell'

export const ShelvesTableRowCooling = observer(
  ({ shelves, setTemperatureValue }) => {
    return (
      <TableRow>
        <TableCell>Охлаждение</TableCell>
        <TableCell></TableCell>
        <ShelvesTemperatureTableCell
          temperatureValue={shelves[2].temperature}
          setTemperatureValue={(value) => {
            setTemperatureValue(value, 2)
          }}
        />
      </TableRow>
    )
  },
)
