import React, { useState } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
} from '@mui/material'
import { observer } from 'mobx-react-lite'

export const CreateProfileDialog = observer(({ isOpen, setOpen, onSubmit }) => {
  const [value, setValue] = useState(0)
  const handleChange = (event) => {
    setValue(event.target.value)
  }

  const handleSubmit = () => {
    onSubmit(value)
  }

  const handleClose = () => {
    setOpen(false)
    setValue(0)
  }

  return (
    <>
      <Dialog onClose={handleClose} open={isOpen}>
        <DialogContent>
          <FormControl>
            <FormLabel color="success" id="profile-layout">
              Выбор шаблона:
            </FormLabel>
            <RadioGroup
              color="success"
              name="profile-layout"
              value={value}
              onChange={handleChange}
            >
              <FormControlLabel
                value="0"
                control={<Radio color="success" />}
                label="Пустой шаблон"
              />
              <FormControlLabel
                value="1"
                control={<Radio color="success" />}
                label="Шаблон для свинцовой пасты"
              />
              <FormControlLabel
                value="2"
                control={<Radio color="success" />}
                label="Шаблон для безсвинцовой пасты"
              />
            </RadioGroup>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button color="success" onClick={handleSubmit}>
            Продолжить
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
})
