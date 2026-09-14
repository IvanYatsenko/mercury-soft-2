import { observer } from 'mobx-react-lite'
import { TableCell } from '@mui/material'
import { useState } from 'react'
import { DialogModalKeyboardNumeric } from '../UI/DialogModalKeyboardNumeric/DialogModalKeyboardNumeric'

export const ShelvesTemperatureTableCell = observer(
  ({ temperatureValue, setTemperatureValue }) => {
    const [openEditCellTemperatureModal, setOpenEditCellTemperatureModal] =
      useState(false)

    return (
      <TableCell
        align="center"
        onClick={() => {
          setOpenEditCellTemperatureModal(true)
        }}
      >
        {temperatureValue}
        {openEditCellTemperatureModal && (
          <DialogModalKeyboardNumeric
            openModal={openEditCellTemperatureModal}
            openModalHandler={setOpenEditCellTemperatureModal}
            enableHandler={(value) => {
              setTemperatureValue(Number(value))
              setOpenEditCellTemperatureModal(false)
            }}
            value={temperatureValue}
          />
        )}
      </TableCell>
    )
  },
)
