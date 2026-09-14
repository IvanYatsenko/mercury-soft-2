import { AppBar, Avatar, Toolbar, Typography } from '@mui/material'
import iconMercury from '../../../assets/mercury1.ico?asset'

import React from 'react'
import { observer } from 'mobx-react-lite'

export const HeaderView = observer(({ version }) => {
  return (
    <AppBar color='inherit' position='sticky'>
      <Toolbar>
        <Avatar
          sx={{
            height: '25px',
            width: '25px',
            marginRight: '15px',
            marginLeft: '-5px'
          }}
          srcSet={iconMercury}
        />
        <Typography
          color={'#2e7d32'}
          variant='h6'
          component='div'
          sx={{ flexGrow: 1 }}
        >
          Меркурий
        </Typography>
        <Typography color={'#2e7d32'} variant='span' component='span'>
          {version}
        </Typography>
      </Toolbar>
    </AppBar>
  )
})
