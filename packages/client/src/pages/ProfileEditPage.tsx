import React, { useState } from 'react';
import PanelLayout from '../components/PanelLayout';
import {
  Box,
  Typography,
  Button,
  TextField,
  Checkbox,
  FormControlLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  AlertTitle,
} from '@mui/material';
import {
  ArrowBack,
  Save,
  ContentCopy,
  Delete,
  KeyboardArrowUp,
  KeyboardArrowDown,
  Add,
  CheckCircle,
} from '@mui/icons-material';

const ProfileEditPage: React.FC = () => {
  const [stages] = useState([
    { time: '0', temp: '30' },
    { time: '150', temp: '150' },
    { time: '110', temp: '150' },
    { time: '100', temp: '230' },
    { time: '20', temp: '230' },
    { time: '75', temp: '200' },
    { time: '167', temp: '150' },
    { time: '250', temp: '100' },
  ]);

  return (
    <PanelLayout
      header={
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Button startIcon={<ArrowBack />} sx={{ minWidth: 'auto' }}></Button>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
              Редактирование
            </Typography>
          </Box>
          <Typography variant="body2">Свинцовая паста</Typography>
        </>
      }
      leftPanel={
        <>
          {/* Name Field */}
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary" display="block" mb={0.25}>
              Название профиля
            </Typography>
            <TextField fullWidth size="small" defaultValue="Свинцовая паста" />
          </Box>

          {/* Mode Selector */}
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary" display="block" mb={0.25}>
              Режим редактирования
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Button fullWidth variant="contained">
                Детальный
              </Button>
              <Button fullWidth variant="outlined">
                Упрощенный
              </Button>
            </Box>
          </Box>

          {/* Sensor Checkbox */}
          <FormControlLabel control={<Checkbox size="small" />} label="Датчик на плате" />

          {/* Actions */}
          <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Button variant="contained" fullWidth startIcon={<Save />} sx={{ color: 'white' }}>
              СОХРАНИТЬ
            </Button>
            <Button variant="outlined" fullWidth startIcon={<ContentCopy />}>
              КОПИРОВАТЬ
            </Button>
            <Button variant="contained" fullWidth startIcon={<Delete />} color="error">
              УДАЛИТЬ
            </Button>
          </Box>
        </>
      }
      rightPanel={
        <>
          {/* Stages Table */}
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              textTransform="uppercase"
              display="block"
              mb={0.5}
            >
              Стадии термопрофиля
            </Typography>
            <TableContainer component={Paper} sx={{ bgcolor: 'transparent', boxShadow: 'none' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontSize: '10px', color: 'text.secondary' }}>
                      Время (с)
                    </TableCell>
                    <TableCell sx={{ fontSize: '10px', color: 'text.secondary' }}>
                      Темп-ра (°C)
                    </TableCell>
                    <TableCell sx={{ fontSize: '10px', color: 'text.secondary', minWidth: 60 }}>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <KeyboardArrowUp fontSize="inherit" />
                        <KeyboardArrowDown fontSize="inherit" />
                        <Delete fontSize="inherit" />
                      </Box>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {stages.map((stage, i) => (
                    <TableRow
                      key={i}
                      sx={{ '&:last-child': { borderBottom: 1, borderColor: 'divider' } }}
                    >
                      <TableCell>
                        <TextField
                          size="small"
                          type="number"
                          defaultValue={stage.time}
                          sx={{ width: '100%' }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          type="number"
                          defaultValue={stage.temp}
                          sx={{ width: '100%' }}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.25 }}>
                          <Button
                            size="small"
                            startIcon={<KeyboardArrowUp />}
                            sx={{ minWidth: 0, padding: 0.25 }}
                          />
                          <Button
                            size="small"
                            startIcon={<KeyboardArrowDown />}
                            sx={{ minWidth: 0, padding: 0.25 }}
                          />
                          <Button
                            size="small"
                            startIcon={<Delete />}
                            sx={{ minWidth: 0, padding: 0.25 }}
                          />
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Add Button */}
            <Button variant="outlined" fullWidth sx={{ mt: 0.75 }} startIcon={<Add />}>
              ДОБАВИТЬ СТРОКУ
            </Button>
          </Box>

          {/* Validation Warning */}
          <Alert severity="error" sx={{ mt: 1 }}>
            <AlertTitle sx={{ fontSize: '10px' }}>Внимание</AlertTitle>
            Скорость нагрева 1.2 °C/с превышает допустимую (0.7 °C/с) для Меркурий-301. Профиль не
            может быть выполнен.
          </Alert>

          {/* Summary */}
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              textTransform="uppercase"
              display="block"
              mb={0.5}
            >
              <CheckCircle fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
              Итого
            </Typography>
            <Box
              sx={{
                bgcolor: 'background.paper',
                borderRadius: 1,
                p: 0.75,
                fontSize: '10px',
                border: 1,
                borderColor: 'divider',
              }}
            >
              {[
                ['Общее время:', '872 с'],
                ['Стадий:', '8'],
                ['Макс. температура:', '230°C'],
              ].map(([label, value], i) => (
                <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.25 }}>
                  <Typography variant="caption" color="text.secondary">
                    {label}
                  </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 500 }}>
                    {value}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </>
      }
      footer={
        <>
          <Typography variant="caption">Профиль: Свинцовая паста</Typography>
          <Typography variant="caption">Детальный режим</Typography>
        </>
      }
    />
  );
};

export default ProfileEditPage;
