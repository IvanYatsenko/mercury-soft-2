import { Box, Modal, Typography } from '@mui/material'
import { observer } from 'mobx-react-lite'
import React from 'react'

export const AlertModal = observer(({ stat }) => {
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
        open={!!(stat & (1 << 6)) || !!(stat & (1 << 7))}
        aria-labelledby='modal-modal-title'
        aria-describedby='modal-modal-description'
      >
        <Box sx={style} style={{ borderRadius: '7px' }}>
          <Typography id='modal-modal-title' variant='h6' component='h2'>
            {
              // eslint-disable-next-line no-extra-boolean-cast
              !!(stat & (1 << 6)) ? (
                <>
                  <span
                    style={{
                      color: '#cc2c2cfa',
                      width: '100%',
                      display: 'inline-block',
                      textAlign: 'center',
                      fontSize: '16px'
                    }}
                  >
                    Нажата кнопка "Авария"!
                  </span>
                  <span
                    style={{
                      color: 'black',
                      width: '100%',
                      display: 'inline-block',
                      textAlign: 'center',
                      fontSize: '12px'
                    }}
                  >
                    Выключите кнопку, <br /> перезапустите устройство
                  </span>
                  <br />
                </>
              ) : (
                <></>
              )
            }
            {
              // eslint-disable-next-line no-extra-boolean-cast
              !!(stat & (1 << 7)) ? (
                <>
                  <span
                    style={{
                      color: '#ed6c02',
                      width: '100%',
                      display: 'inline-block',
                      textAlign: 'center',
                      fontSize: '16px'
                    }}
                  >
                    Сбой питания печи!
                  </span>{' '}
                  <br />
                </>
              ) : (
                <></>
              )
            }
          </Typography>
        </Box>
      </Modal>
    </div>
  )
})
