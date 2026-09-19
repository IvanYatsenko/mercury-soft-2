import React from 'react';
import { Box, Typography } from '@mui/material';
import { Construction } from '@mui/icons-material';

const ComingSoonPage: React.FC = () => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        textAlign: 'center',
        gap: 2,
        bgcolor: 'background.default',
      }}
    >
      <Construction sx={{ fontSize: 80, color: 'text.disabled' }} />
      <Typography variant="h4" color="text.disabled" fontWeight="bold">
        В РАЗРАБОТКЕ
      </Typography>
      <Typography variant="h6" color="text.secondary">
        Веб-интерфейс находится в разработке
      </Typography>
      <Typography variant="body1" color="text.secondary">
        Используйте интерфейс печи управления
      </Typography>
    </Box>
  );
};

export default ComingSoonPage;
