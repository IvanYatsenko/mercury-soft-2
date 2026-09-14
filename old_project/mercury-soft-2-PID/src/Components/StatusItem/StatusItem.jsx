import React from 'react'
import { Card } from '@mui/material'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import { observer } from 'mobx-react-lite'

export const StatusItem = observer(
  ({ name, value, tempItem = false, warning = false }) => {
    return (
      <Card
        variant='string'
        style={{
          marginLeft: warning ? '-20px' : '',
          padding: warning ? '5px' : '0px',
          marginBottom: '5px',
          background: warning ? '#ed6c02' : 'none',
          maxWidth: warning ? '120px' : '100px',
          width: warning ? '90px' : 'auto'
        }}
      >
        <CardContent style={{ padding: '0px' }}>
          <Typography
            sx={{
              fontSize: tempItem ? 24 : 14,
              width: tempItem ? '20px' : 'auto'
            }}
            component='div'
          >
            {name}
            <b style={{ marginLeft: tempItem ? 0 : '5px' }}>{value}</b>
          </Typography>
        </CardContent>
      </Card>
    )
  }
)
