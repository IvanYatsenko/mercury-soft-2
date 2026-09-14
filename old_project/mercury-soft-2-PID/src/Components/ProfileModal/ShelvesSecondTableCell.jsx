import { TableCell } from '@mui/material'
import { observer } from 'mobx-react-lite'
import { useState } from 'react'
import { DialogModalKeyboardNumeric } from '../UI/DialogModalKeyboardNumeric/DialogModalKeyboardNumeric'

export const ShelvesSecondTableCell = observer(
  ({ secondValue, setSecondValue }) => {
      const [openEditCellSecondModal, setOpenEditCellSecondModal] =
        useState(false)
  
      return (
        <TableCell
          align="center"
          onClick={() => {
            setOpenEditCellSecondModal(true)
          }}
        >
          {secondValue}
          {openEditCellSecondModal && (
            <DialogModalKeyboardNumeric
              openModal={openEditCellSecondModal}
              openModalHandler={setOpenEditCellSecondModal}
              enableHandler={(value) => {
                setSecondValue(Number(value))
                setOpenEditCellSecondModal(false)
              }}
              value={secondValue}
            />
          )}
        </TableCell>
      )
    }
)
