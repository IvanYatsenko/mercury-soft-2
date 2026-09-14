import { TableCell, TableRow } from '@mui/material'
import { observer } from 'mobx-react-lite'
import { useState } from 'react'
import { DialogModalKeyboardNumeric } from '../../UI/DialogModalKeyboardNumeric/DialogModalKeyboardNumeric'

export const TableRowTab = observer(({ temp, coef, ovenStore, showFullSettings }) => {
  const [openModal, setOpenModal] = useState(false)

  const changeValue = (value) => {
    if(value > (temp - 20) && value < (temp + 20)) {
        const newCoef = (value / temp).toFixed(3)
        ovenStore.calibratePoint({temp: temp, coef: newCoef})
    } else {
        ovenStore.calibratePoint({temp: temp, coef: 1})
    }
    setOpenModal(false)
  }

  return (
    <>
      <TableRow sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
        <TableCell
          component="th"
          scope="row"
          onClick={() => {
            if(showFullSettings) {
              setOpenModal(true)
            }
          }}
        >
          {(temp * coef).toFixed(0)}
        </TableCell>
        <TableCell
          onClick={() => {
            if(showFullSettings) {
              setOpenModal(true)
            }
          }}
        >
          {temp}
        </TableCell>
        <TableCell>{coef}</TableCell>
      </TableRow>
      {openModal && (
        <DialogModalKeyboardNumeric
          openModal={openModal}
          openModalHandler={setOpenModal}
          enableHandler={changeValue}
          value={(temp * coef).toFixed(0)}
        />
      )}
    </>
  )
})
