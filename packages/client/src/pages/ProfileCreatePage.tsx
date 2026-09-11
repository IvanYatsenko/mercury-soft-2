import React, { useState } from 'react';
import PanelLayout from '../components/PanelLayout';
import { Box, Typography, Button, TextField, Radio, Alert } from '@mui/material';
import { ArrowBack, Check, Close, AutoAwesome, Info } from '@mui/icons-material';

const ProfileCreatePage: React.FC = () => {
  const [selectedTemplate, setSelectedTemplate] = useState(0);

  const templates = [
    { name: 'Пустой шаблон', desc: 'Начать с нуля, добавить стадии вручную' },
    { name: 'Шаблон для свинцовой пасты', desc: 'Предустановленные стадии: 150°C / 230°C / 100°C' },
    {
      name: 'Шаблон для бессвинцовой пасты',
      desc: 'Предустановленные стадии: 180°C / 250°C / 100°C',
    },
  ];

  return (
    <PanelLayout
      header={
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Button startIcon={<ArrowBack />} sx={{ minWidth: 'auto' }}></Button>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
              Создание профиля
            </Typography>
          </Box>
          <Typography variant="body2">Новый</Typography>
        </>
      }
      leftPanel={
        <>
          {/* Name Field */}
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary" display="block" mb={0.25}>
              Название профиля
            </Typography>
            <TextField
              fullWidth
              size="small"
              placeholder="Введите название..."
              defaultValue="Новый профиль"
            />
          </Box>

          {/* Paste Type */}
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary" display="block" mb={0.25}>
              Тип пасты
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Button fullWidth variant="outlined">
                Свинцовая
              </Button>
              <Button fullWidth variant="outlined">
                Бессвинцовая
              </Button>
            </Box>
          </Box>

          {/* Mode */}
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary" display="block" mb={0.25}>
              Режим
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

          {/* Actions */}
          <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Button variant="contained" fullWidth startIcon={<Check />} sx={{ color: 'white' }}>
              СОЗДАТЬ
            </Button>
            <Button variant="outlined" fullWidth startIcon={<Close />}>
              ОТМЕНА
            </Button>
          </Box>
        </>
      }
      rightPanel={
        <>
          {/* Template Selection */}
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              textTransform="uppercase"
              display="block"
              mb={0.5}
            >
              <AutoAwesome fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
              Выберите шаблон
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
              {templates.map((template, i) => (
                <Box
                  key={i}
                  onClick={() => setSelectedTemplate(i)}
                  sx={{
                    bgcolor: 'background.paper',
                    borderRadius: 1,
                    p: 1,
                    border: 1,
                    borderColor: i === selectedTemplate ? 'success.main' : 'divider',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    ...(i === selectedTemplate && {
                      bgcolor: 'success.lighter',
                    }),
                  }}
                >
                  <Radio
                    checked={i === selectedTemplate}
                    onChange={() => setSelectedTemplate(i)}
                    size="small"
                    sx={{
                      '& .MuiSvgIcon-root': { fontSize: '16px' },
                    }}
                  />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '11px' }}>
                      {template.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block" mt={0.25}>
                      {template.desc}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>

          {/* Preview */}
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              textTransform="uppercase"
              display="block"
              mb={0.5}
            >
              Предпросмотр шаблона
            </Typography>
            <Box
              sx={{
                bgcolor: 'background.paper',
                borderRadius: 1,
                p: 1,
                fontSize: '10px',
                border: 1,
                borderColor: 'divider',
              }}
            >
              {[
                ['Стадий:', '0'],
                ['Общее время:', '0 с'],
                ['Макс. темп-ра:', '—'],
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

          {/* Hint */}
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              textTransform="uppercase"
              display="block"
              mb={0.5}
            >
              <Info fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
              Подсказка
            </Typography>
            <Alert severity="info" sx={{ fontSize: '10px' }}>
              После создания профиля вы сможете отредактировать его в детальном или упрощенном
              режиме, добавить стадии и настроить параметры нагрева/охлаждения.
            </Alert>
          </Box>
        </>
      }
      footer={
        <>
          <Typography variant="caption">Шаблон: Пустой</Typography>
          <Typography variant="caption">Шаг 1 из 2</Typography>
        </>
      }
    />
  );
};

export default ProfileCreatePage;
