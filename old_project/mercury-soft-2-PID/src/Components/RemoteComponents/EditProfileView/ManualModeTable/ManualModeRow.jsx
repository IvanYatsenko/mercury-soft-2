import React, { useState } from 'react'
import { IconButton, Input, TableCell, TableRow } from '@mui/material'
import DeleteIcon from '@mui/icons-material/Delete'
import DownloadIcon from '@mui/icons-material/Download'
import UploadIcon from '@mui/icons-material/Upload'
import { observer } from 'mobx-react-lite'

export const ManualModeRow = observer(
  ({
    point,
    index,
    setSecondValue,
    setTemperatureValue,
    toggleUpPoint,
    removePoint,
    points,
    toggleDownPoint
  }) => {
    const [tempValue, setTempValue] = useState(point.temperature)
    let timeout
    return (
      <TableRow>
        <TableCell sx={{ p: 1 }}>
          <Input
            color='success'
            sx={{ ml: 1, maxWidth: '50px' }}
            value={point.second}
            onChange={(e) => setSecondValue(e.target.value, index)}
          />
        </TableCell>
        <TableCell sx={{ p: 1 }}>
          <Input
            color='success'
            sx={{ ml: 1, maxWidth: '50px' }}
            value={tempValue}
            onChange={(e) =>{
              setTempValue(e.target.value)
              clearTimeout(timeout)
              timeout = setTimeout(() => {
                setTemperatureValue(e.target.value, index)
              }, 1000);
            }}
          />
        </TableCell>
        <TableCell align='right' sx={{ whiteSpace: 'nowrap' }}>
          <IconButton
            color='success'
            disabled={index === 0}
            onClick={() => {
              toggleUpPoint(index)
            }}
          >
            <UploadIcon />
          </IconButton>
          <IconButton
            color='success'
            disabled={index === points.length - 1}
            onClick={() => {
              toggleDownPoint(index)
            }}
          >
            <DownloadIcon />
          </IconButton>
          <IconButton
            color='error'
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
