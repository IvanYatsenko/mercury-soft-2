import React from 'react'
import { IconButton, TableCell, TableRow } from '@mui/material'
import { PointsSecondTableCell } from './PointsSecondTableCell'
import { PointsTemperatureTableCell } from './PointsTemperatureTableCell'
import DeleteIcon from '@mui/icons-material/Delete'
import DownloadIcon from '@mui/icons-material/Download'
import UploadIcon from '@mui/icons-material/Upload'
import { observer } from 'mobx-react-lite'

export const PointsTableRow = observer(({ points, point, index, setSecondValue, setTemperatureValue, toggleUpPoint, toggleDownPoint, removePoint }) => {

  return (
    <TableRow
      sx={{
        '&:last-child td, &:last-child th': { border: 0 },
      }}
    >
      <PointsSecondTableCell
        secondValue={point.second}
        setSecondValue={(value) => {
          setSecondValue(value, index)
        }}
      />
      <PointsTemperatureTableCell
        temperatureValue={point.temperature}
        setTemperatureValue={(value) => {
          setTemperatureValue(value, index)
        }}
      />
      <TableCell align="center">
        <IconButton
          color="success"
          disabled={index === 0}
          onClick={() => {
            toggleUpPoint(index)
          }}
        >
          <UploadIcon />
        </IconButton>
        <IconButton
          color="success"
          disabled={index === points.length - 1}
          onClick={() => {
            toggleDownPoint(index)
          }}
        >
          <DownloadIcon />
        </IconButton>
        <IconButton
          color="error"
          onClick={() => {
            removePoint(index)
          }}
        >
          <DeleteIcon />
        </IconButton>
      </TableCell>
    </TableRow>
  )
}
)