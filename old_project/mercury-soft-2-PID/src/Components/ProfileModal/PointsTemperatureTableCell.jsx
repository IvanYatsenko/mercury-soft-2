import { TableCell } from '@mui/material'
import React, { useState } from 'react'
import { DialogModalKeyboardNumeric } from '../UI/DialogModalKeyboardNumeric/DialogModalKeyboardNumeric'
import { observer } from 'mobx-react-lite'

export const PointsTemperatureTableCell = observer(
  ({ temperatureValue, setTemperatureValue }) => {
    const [openEditRowTemperatureModal, setOpenEditRowTemperatureModal] =
      useState(false)
    return (
      <TableCell
        align='center'
        onClick={() => {
          setOpenEditRowTemperatureModal(true)
        }}
      >
        {temperatureValue}
        {openEditRowTemperatureModal && (
          <DialogModalKeyboardNumeric
            openModal={openEditRowTemperatureModal}
            openModalHandler={setOpenEditRowTemperatureModal}
            enableHandler={(value) => {
              setTemperatureValue(Number(value))
              setOpenEditRowTemperatureModal(false)
            }}
            value={temperatureValue}
          />
        )}
      </TableCell>
    )
  }
)
