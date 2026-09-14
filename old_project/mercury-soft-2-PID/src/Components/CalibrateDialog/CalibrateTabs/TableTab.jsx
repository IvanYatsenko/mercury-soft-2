import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material'
import ArrowCircleDownIcon from '@mui/icons-material/ArrowCircleDown'
import ArrowCircleUpIcon from '@mui/icons-material/ArrowCircleUp'
import { observer } from 'mobx-react-lite'
import { TableRowTab } from './TableRowTab'
import { useState } from 'react'

export const TableTab = observer(({ ovenStore, showFullSettings }) => {
  const [openWarningModal, setOpenWarningModal] = useState(false)
  const warningModalHandler = (value) => {
    if (value) {
      ovenStore.resetCalibrate()
    }
    setOpenWarningModal(false)
  }

  return (
    <>
      <List>
        <ListItem>
          <TableContainer component={Paper} sx={{ overflowY: 'auto' }}>
            <Table aria-label='simple table'>
              <TableHead>
                <TableRow>
                  <TableCell>Фактическая T°С</TableCell>
                  <TableCell>Основная T°С</TableCell>
                  <TableCell>Коэффициент</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ovenStore.tableCorrect.map(({ temp, coef }) => {
                  if (temp >= 60 && temp <= 260) {
                    return (
                      <TableRowTab
                        showFullSettings={showFullSettings}
                        ovenStore={ovenStore}
                        key={temp}
                        temp={temp}
                        coef={coef}
                      />
                    )
                  }
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </ListItem>
        <ListItem sx={{ justifyContent: 'center' }}>
          <Button
            color='error'
            variant='outlined'
            onClick={() => setOpenWarningModal(true)}
          >
            Сбросить на заводские настройки
          </Button>
        </ListItem>
        <div
          style={{
            position: 'sticky',
            right: '8px',
            bottom: '58px',
            float: 'right',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <IconButton
            sx={{ mr: '1rem', mb: '1rem', padding: 0 }}
            color='success'
            size='large'
            variant='contained'
            onClick={(e) => {
              e.stopPropagation()
              document.getElementById('calibrate-table').scrollBy(0, -100)
            }}
          >
            <ArrowCircleUpIcon sx={{ fontSize: '40px' }} />
          </IconButton>
          <IconButton
            sx={{ padding: 0, mr: '1rem' }}
            color='success'
            size='large'
            variant='contained'
            onClick={(e) => {
              e.stopPropagation()
              document.getElementById('calibrate-table').scrollBy(0, 100)
            }}
          >
            <ArrowCircleDownIcon sx={{ fontSize: '40px' }} />
          </IconButton>
        </div>
      </List>
      <Dialog
        open={openWarningModal}
        aria-labelledby='alert-dialog-title'
        aria-describedby='alert-dialog-description'
      >
        <DialogTitle id='alert-dialog-title'>{'Внимание!'}</DialogTitle>
        <DialogContent>
          <DialogContentText id='alert-dialog-description'>
            <Typography variant='span' component={'span'} color='red'>
              Все значения калибровки температуры будут сброшены на заводские настройки!
              <br />
              <br />
            </Typography>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button color='error' onClick={() => warningModalHandler(false)}>
            Отмена
          </Button>
          <Button color='success' onClick={() => warningModalHandler(true)}>
            Ок
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
})
