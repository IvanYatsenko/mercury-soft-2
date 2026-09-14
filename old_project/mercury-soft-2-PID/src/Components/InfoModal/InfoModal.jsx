import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Modal,
  Typography
} from '@mui/material'
import { observer } from 'mobx-react-lite'
import React, { useState } from 'react'

export const InfoModal = observer(
  ({
    ovenIP,
    onOpen,
    setClose,
    version,
    handleUpdate,
    versionToUpdate,
    updateFlag,
    downloadFlag,
    errorDownloadFile,
    downloadApp,
    installApp,
    readyToUpdate,
    _checkFlagMD5,
    moveFile,
    removeFile,
    unzipFile,
    chmodeFile
  }) => {
    const [isDisabledBtn, setDisabledBtn] = useState(false)
    const [hideInstallBtn, setHideInstallBtn] = useState(true)
    const [openUpdateDialog, setOpenUpdateDialog] = useState(false)
    const [openAlert, setOpenAlert] = useState(false)
    const [openDownloadDialog, setOpenDownloadDialog] = useState(false)
    const closeUpdateDialog = () => {
      setOpenAlert(true)
    }

    const onSuccesCloseAlert = () => {
      setOpenAlert(false)
      setDisabledBtn(false)
      setOpenUpdateDialog(false)
      setOpenDownloadDialog(true)
      downloadApp()
    }

    const onCancelCloseAlert = () => {
      setOpenAlert(false)
    }
    const style = {
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      bgcolor: 'background.paper',
      border: '2px solid #000',
      p: 1
    }
    return (
      <div>
        <Modal
          open={onOpen}
          onClose={setClose}
          aria-labelledby='modal-modal-title'
          aria-describedby='modal-modal-description'
        >
          <Box sx={style} style={{ borderRadius: '7px' }}>
            <Typography id='modal-modal-title' variant='h6' component='h2'>
              Меркурий - 2 <br />
              Версия: {`${version}`}
              <br />
              {`IP: ` + ovenIP}
            </Typography>
            {/* <Button onClick={handleUpdate}>Click</Button> */}
            {ovenIP && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Button
                  disabled={isDisabledBtn}
                  variant='outlined'
                  color='success'
                  onClick={() => {
                    setDisabledBtn(true)
                    handleUpdate()
                    setOpenUpdateDialog(true)
                  }}
                >
                  проверить обновления
                </Button>
              </Box>
            )}
            <Dialog
              open={openUpdateDialog}
              aria-labelledby='alert-dialog-title'
              aria-describedby='alert-dialog-description'
            >
              <DialogTitle id='alert-dialog-title'>
                {'Проверка обновления'}
              </DialogTitle>
              <DialogContent>
                <DialogContentText id='alert-dialog-description'>
                  Текущая версия ПО - {`${version}`}
                  <br />
                  Последняя версия ПО - {`${versionToUpdate}`}
                </DialogContentText>
              </DialogContent>
              <DialogActions>
                <Button
                  onClick={() => {
                    setOpenUpdateDialog(false)
                    setDisabledBtn(false)
                  }}
                  color='error'
                >
                  отмена
                </Button>
                <Button
                  color='success'
                  disabled={updateFlag}
                  onClick={closeUpdateDialog}
                >
                  Обновить
                </Button>
              </DialogActions>
            </Dialog>
            <Dialog
              open={openDownloadDialog}
              aria-labelledby='alert-dialog-title'
              aria-describedby='alert-dialog-description'
            >
              <DialogTitle id='alert-dialog-title'>
                {'Загрузка обновления!'}
              </DialogTitle>
              <DialogContent>
                <DialogContentText id='alert-dialog-description'>
                  <Typography variant='span' component={'span'} color='red'>
                    Не отключайте питание!
                    <br />
                  </Typography>
                  {moveFile && (
                    <>
                      Перемещение <br />
                    </>
                  )}
                  {removeFile && (
                    <>
                      Удаление временых файлов<br />
                    </>
                  )}
                  {unzipFile && (
                    <>
                      Распаковка новой версии<br />
                    </>
                  )}
                  {chmodeFile && (
                    <>
                      Установка прав <br />
                    </>
                  )}
                  {hideInstallBtn
                    ? !downloadFlag && readyToUpdate
                      ? 'Обновление готово к установке'
                      : 'Идет загрузка...'
                    : ''}
                  {_checkFlagMD5 ? (
                    <>
                      <br />
                      Проверка файла...
                    </>
                  ) : (
                    ''
                  )}
                  {errorDownloadFile ? (
                    <>
                      <br />
                      При загрузке обновления произошла ошибка, проверьте
                      соединение с интернетом или повторите загрузку позднее.
                    </>
                  ) : (
                    ''
                  )}
                </DialogContentText>
              </DialogContent>
              <DialogActions>
                <Button
                  sx={{ display: hideInstallBtn ? 'flex' : 'none' }}
                  color='success'
                  disabled={!readyToUpdate}
                  onClick={() => {
                    setHideInstallBtn(false)
                    installApp()
                    // setOpenDownloadDialog(false)
                  }}
                >
                  Установить
                </Button>
                {errorDownloadFile ? (
                  <Button
                    color='error'
                    onClick={() => {
                      setOpenDownloadDialog(false)
                    }}
                  >
                    Закрыть
                  </Button>
                ) : (
                  <></>
                )}
              </DialogActions>
            </Dialog>
            <Dialog
              open={openAlert}
              aria-labelledby='alert-dialog-title'
              aria-describedby='alert-dialog-description'
            >
              <DialogTitle id='alert-dialog-title'>{'Внимание!'}</DialogTitle>
              <DialogContent>
                <DialogContentText id='alert-dialog-description'>
                  <Typography variant='span' component={'span'} color='red'>
                    При загрузке обновления не отключайте питание!
                    <br />
                    <br />
                  </Typography>
                </DialogContentText>
              </DialogContent>
              <DialogActions>
                <Button color='error' onClick={onCancelCloseAlert}>
                  Отмена
                </Button>
                <Button color='success' onClick={onSuccesCloseAlert}>
                  Ок
                </Button>
              </DialogActions>
            </Dialog>
          </Box>
        </Modal>
      </div>
    )
  }
)
