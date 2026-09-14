import { TableCell } from '@mui/material'
import React, { useState } from 'react'
import { DialogModalKeyboardNumeric } from '../UI/DialogModalKeyboardNumeric/DialogModalKeyboardNumeric'
import { observer } from 'mobx-react-lite'

export const PointsSecondTableCell = observer(({ secondValue, setSecondValue }) => {
  const [openEditRowSecondModal, setOpenEditRowSecondModal] = useState(false)
  return (
    <TableCell
      align="center"
      onClick={() => {
        setOpenEditRowSecondModal(true)
      }}
    >
      {secondValue}
      {openEditRowSecondModal && (
        <DialogModalKeyboardNumeric
          openModal={openEditRowSecondModal}
          openModalHandler={setOpenEditRowSecondModal}
          enableHandler={(value) => {
            setSecondValue(Number(value))
            setOpenEditRowSecondModal(false)
          }}
          value={secondValue}
        />
      )}
    </TableCell>
  )
}
)