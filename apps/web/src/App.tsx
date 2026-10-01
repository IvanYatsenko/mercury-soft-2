import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  LinearProgress,
  Radio,
  RadioGroup,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import type { Profile } from '@mercury/shared';
import { ProfileEditorPage } from './ProfileEditorPage';
import { SettingsPage, type OvenSettings } from './SettingsPage';

type AppProps = {
  mode: 'light' | 'dark';
  onToggleMode: () => void;
};

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)} мин`;
}

export function App({ mode, onToggleMode }: AppProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileTemplates, setProfileTemplates] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<
    'profiles' | 'settings' | 'editor'
  >('profiles');
  const [draftProfile, setDraftProfile] = useState<Profile | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [settings, setSettings] = useState<OvenSettings>({
    fanReferenceRpm: 1500,
    reactToFanErrors: true,
    soundOnErrors: true,
    thermalProtection: true,
    thermocoupleCorrection: false,
  });
  const [notice, setNotice] = useState('');
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(-1);
  const isFullPage = activeSection === 'settings' || activeSection === 'editor';
  const contentRef = useRef<HTMLElement | null>(null);

  const scrollContent = (direction: -1 | 1) => {
    contentRef.current?.scrollBy({ top: direction * 180, behavior: 'smooth' });
  };

  const beginEditing = (profile: Profile, index: number | null) => {
    setDraftProfile(structuredClone(profile));
    setEditingIndex(index);
    setSelectedProfile(profile.name);
    setActiveSection('editor');
  };

  const createProfile = () => {
    setSelectedTemplate(-1);
    setTemplatePickerOpen(true);
  };

  const continueWithTemplate = () => {
    const blankProfile: Profile = {
      mode: 'manual',
      name: 'Новый профиль',
      board: false,
      points: [{ second: 0, temperature: 30 }],
      shelves: [
        { second: 0, temperature: 30 },
        { second: 0, temperature: 30 },
        { second: 0, temperature: 30 },
      ],
    };

    const template = selectedTemplate < 0
      ? blankProfile
      : profileTemplates[selectedTemplate];
    if (!template) return;

    setTemplatePickerOpen(false);
    beginEditing(structuredClone(template), null);
  };

  const saveDraft = () => {
    if (!draftProfile) return;

    setProfiles((current) => {
      if (editingIndex === null) return [...current, draftProfile];
      return current.map((profile, index) =>
        index === editingIndex ? draftProfile : profile,
      );
    });
    setSelectedProfile(draftProfile.name);
    setDraftProfile(null);
    setEditingIndex(null);
    setActiveSection('profiles');
    setNotice('Сохранено в браузере; на сервер профиль пока не записан');
  };

  const cancelEditing = () => {
    setDraftProfile(null);
    setEditingIndex(null);
    setActiveSection('profiles');
  };

  useEffect(() => {
    const controller = new AbortController();

    async function loadProfiles() {
      try {
        const response = await fetch('/api/profile-templates', {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Сервер ответил с ошибкой ${response.status}`);
        }

        const data = (await response.json()) as Profile[];
        setProfiles(data);
        setProfileTemplates(data);
        setSelectedProfile(data[0]?.name ?? null);
      } catch (loadError) {
        if (loadError instanceof Error && loadError.name === 'AbortError')
          return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Не удалось загрузить профили',
        );
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadProfiles();
    return () => controller.abort();
  }, []);

  return (
    <Box
      sx={{
        height: '100dvh',
        minHeight: 320,
        p: { xs: 0, sm: 2 },
        bgcolor: 'background.default',
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 1000,
          height: '100%',
          minHeight: 320,
          mx: 'auto',
          display: 'grid',
          gridTemplateRows: isFullPage ? 'minmax(0, 1fr)' : '36px minmax(0, 1fr)',
          overflow: 'hidden',
          bgcolor: 'background.paper',
          border: { xs: 0, sm: 1 },
          borderColor: 'divider',
          borderRadius: { xs: 0, sm: 1 },
        }}
      >
        {!isFullPage && <Box
          component="header"
          sx={{
            px: 1.25,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            bgcolor: 'action.hover',
          }}
        >
          <Typography aria-hidden sx={{ color: 'primary.main', fontSize: 19 }}>
            ☼
          </Typography>
          <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 700 }}>
            Меркурий-301
          </Typography>
          <IconButton
            aria-label="Переключить тему"
            onClick={onToggleMode}
            size="small"
            sx={{ ml: 0.5 }}
          >
            <Typography component="span" variant="caption">
              {mode === 'dark' ? '☀' : '☾'}
            </Typography>
          </IconButton>
        </Box>}

        <Box
          component="main"
          sx={{
            height: '100%',
            minHeight: 0,
            overflow: 'hidden',
            display: isFullPage ? 'block' : 'grid',
            gridTemplateColumns: isFullPage
              ? undefined
              : {
              xs: 'minmax(176px, 0.82fr) minmax(0, 1fr)',
                  sm: 'minmax(230px, 0.78fr) minmax(0, 1fr)',
                },
          }}
        >
          {!isFullPage && <Stack
            component="section"
            aria-label="Состояние печи"
            spacing={0.6}
            sx={{
              p: 0.75,
              minWidth: 0,
              borderRight: 1,
              borderColor: 'divider',
            }}
          >
            <Card variant="outlined" sx={{ flex: '0 0 auto', minHeight: 105 }}>
              <CardContent
                sx={{
                  p: '7px !important',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 0.2,
                }}
              >
                <Stack direction="row" alignItems="center" spacing={0.6}>
                  <Typography
                    aria-label="Демонстрационное значение температуры"
                    sx={{
                      color: 'warning.main',
                      fontSize: '2rem',
                      fontWeight: 700,
                      lineHeight: 1.1,
                    }}
                  >
                    25°
                  </Typography>
                  <Chip label="ДЕМО" size="small" variant="outlined" />
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Температура камеры
                </Typography>
              </CardContent>
            </Card>

            <Button
              fullWidth
              variant="contained"
              color="success"
              onClick={() => setNotice('Демо: нагрев печи пока не подключён')}
              sx={{ minHeight: 42, color: 'common.black', fontWeight: 700 }}
            >
              ▶ &nbsp; ПУСК
            </Button>
            <Button
              fullWidth
              variant="outlined"
              onClick={() => setActiveSection('settings')}
              sx={{ minHeight: 34 }}
            >
              ⚙ &nbsp; НАСТРОЙКИ
            </Button>
            <Button
              fullWidth
              variant={activeSection === 'profiles' ? 'contained' : 'outlined'}
              onClick={() => setActiveSection('profiles')}
              sx={{ minHeight: 34 }}
            >
              ▣ &nbsp; ПРОФИЛИ
            </Button>
          </Stack>}

          <Box sx={{ minWidth: 0, minHeight: 0, height: '100%', display: 'flex', overflow: 'hidden' }}>
          <Box
            component="section"
            ref={contentRef}
            sx={{ minWidth: 0, minHeight: 0, flex: 1, height: '100%', overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', p: isFullPage ? { xs: 1.25, sm: 2 } : 0.75 }}
          >
            {activeSection === 'profiles' ? (
              <Stack spacing={0.65}>
                <Typography
                  variant="overline"
                  sx={{ minHeight: 26, display: 'flex', alignItems: 'center' }}
                >
                  Термопрофили
                </Typography>

                {isLoading && <LinearProgress />}
                {error && <Alert severity="error">{error}</Alert>}

                {profiles.map((profile, index) => {
                  const duration = profile.points.reduce(
                    (total, point) => total + point.second,
                    0,
                  );
                  const isSelected = selectedProfile === profile.name;

                  return (
                    <Card
                      key={`${index}-${profile.name}`}
                      variant="outlined"
                      sx={{
                        borderLeft: 3,
                        borderLeftColor: isSelected
                          ? 'success.main'
                          : 'info.main',
                        bgcolor: isSelected
                          ? 'action.selected'
                          : 'background.paper',
                      }}
                    >
                      <CardContent sx={{ p: '7px 9px !important' }}>
                        <Stack
                          direction="row"
                          alignItems="center"
                          justifyContent="space-between"
                          spacing={0.5}
                        >
                          <ButtonBase
                            onClick={() => setSelectedProfile(profile.name)}
                            sx={{ minWidth: 0, flex: 1, textAlign: 'left' }}
                          >
                            <Box sx={{ minWidth: 0, width: '100%' }}>
                              <Typography
                                variant="body2"
                                noWrap
                                sx={{ fontWeight: 600 }}
                              >
                                {profile.name}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                noWrap
                              >
                                {profile.mode === 'manual' ? 'Ручной' : 'Простой'}
                                {' • '}
                                {formatDuration(duration)}
                              </Typography>
                            </Box>
                          </ButtonBase>
                          <IconButton
                            aria-label={`Редактировать профиль ${profile.name}`}
                            onClick={() => beginEditing(profile, index)}
                            size="small"
                          >
                            <Typography aria-hidden color="text.secondary">
                              ✎
                            </Typography>
                          </IconButton>
                        </Stack>
                      </CardContent>
                    </Card>
                  );
                })}

                <Button
                  fullWidth
                  variant="outlined"
                  onClick={createProfile}
                  sx={{
                    minHeight: 48,
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                  }}
                >
                  ＋ &nbsp; Новый профиль
                </Button>

              </Stack>
            ) : activeSection === 'settings' ? (
              <SettingsPage
                settings={settings}
                onChange={setSettings}
                onBack={() => setActiveSection('profiles')}
              />
            ) : draftProfile ? (
              <ProfileEditorPage
                profile={draftProfile}
                onChange={setDraftProfile}
                onCancel={cancelEditing}
                onSave={saveDraft}
              />
            ) : (
              <Alert severity="warning">Профиль не выбран</Alert>
            )}
          </Box>
          <Stack
            aria-label="Прокрутка страницы"
            sx={{ width: 38, flexShrink: 0, borderLeft: 1, borderColor: 'divider', bgcolor: 'action.hover' }}
            justifyContent="space-between"
          >
            <Button aria-label="Прокрутить вверх" onClick={() => scrollContent(-1)} sx={{ minWidth: 38, minHeight: 54, fontSize: 24 }}>↑</Button>
            <Button aria-label="Прокрутить вниз" onClick={() => scrollContent(1)} sx={{ minWidth: 38, minHeight: 54, fontSize: 24 }}>↓</Button>
          </Stack>
          </Box>
        </Box>

      </Box>

      <Snackbar
        open={notice !== ''}
        autoHideDuration={3000}
        onClose={() => setNotice('')}
        message={notice}
      />

      <Dialog
        fullScreen
        open={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.5, px: 1 }}>
          <Button
            onClick={() => setTemplatePickerOpen(false)}
            sx={{ minHeight: 40, minWidth: 88 }}
          >
            ← Назад
          </Button>
          Выберите шаблон
        </DialogTitle>
        <DialogContent sx={{ px: 1.5, py: 0, flex: 1, overflowY: 'auto' }}>
          <RadioGroup
            value={String(selectedTemplate)}
            onChange={(event) => setSelectedTemplate(Number(event.target.value))}
          >
            <FormControlLabel
              value="-1"
              control={<Radio />}
              label="Пустой профиль"
              sx={{ minHeight: 48, m: 0, borderBottom: 1, borderColor: 'divider' }}
            />
            {profileTemplates.map((template, index) => (
              <FormControlLabel
                key={`${index}-${template.name}`}
                value={String(index)}
                control={<Radio />}
                label={template.name}
                sx={{ minHeight: 48, m: 0, borderBottom: 1, borderColor: 'divider' }}
              />
            ))}
          </RadioGroup>
        </DialogContent>
        <DialogActions sx={{ p: 0.5 }}>
          <Button
            fullWidth
            variant="contained"
            onClick={continueWithTemplate}
            sx={{ minHeight: 44 }}
          >
            Продолжить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
