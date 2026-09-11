import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
} from '@mui/material';
import { Edit, Delete, Add, Visibility } from '@mui/icons-material';
import { ThermalProfile } from '@mercury-soft-2/shared';
import { apiService } from '../services/api.service';

const ProfilesPage = () => {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<ThermalProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; profileId: string | null }>({
    open: false,
    profileId: null,
  });

  const fetchProfiles = async () => {
    try {
      setLoading(true);
      const data = await apiService.getProfiles();
      setProfiles(data);
      setError(null);
    } catch (err) {
      setError('Не удалось загрузить профили');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const handleDelete = async () => {
    if (!deleteDialog.profileId) return;

    try {
      await apiService.deleteProfile(deleteDialog.profileId);
      setProfiles(profiles.filter((p) => p.id !== deleteDialog.profileId));
      setDeleteDialog({ open: false, profileId: null });
    } catch (err) {
      setError('Не удалось удалить профиль');
    }
  };

  const getModeLabel = (mode: 'easy' | 'manual') => {
    return mode === 'easy' ? 'Упрощённый' : 'Детальный';
  };

  const getModeColor = (mode: 'easy' | 'manual') => {
    return mode === 'easy' ? 'success' : 'primary';
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Термопрофили
        </Typography>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => navigate('/profiles/new')}
          size="large"
        >
          Добавить профиль
        </Button>
      </Box>

      {/* Profiles Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Название</TableCell>
              <TableCell>Режим</TableCell>
              <TableCell>Стадий</TableCell>
              <TableCell>Датчик на плате</TableCell>
              <TableCell>Создан</TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {profiles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <Typography variant="body1" color="text.secondary">
                    Нет термопрофилей
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              profiles.map((profile) => (
                <TableRow key={profile.id} hover>
                  <TableCell>
                    <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                      {profile.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={getModeLabel(profile.mode)}
                      color={
                        getModeColor(profile.mode) as 'success' | 'warning' | 'info' | 'default'
                      }
                      size="small"
                    />
                  </TableCell>
                  <TableCell>{profile.stages.length}</TableCell>
                  <TableCell>{profile.useExternalSensor ? 'Да' : 'Нет'}</TableCell>
                  <TableCell>{new Date(profile.createdAt).toLocaleDateString('ru-RU')}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => navigate(`/profiles/${profile.id}`)}>
                      <Visibility />
                    </IconButton>
                    <IconButton size="small" onClick={() => navigate(`/profiles/${profile.id}`)}>
                      <Edit />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => setDeleteDialog({ open: true, profileId: profile.id })}
                    >
                      <Delete />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, profileId: null })}
      >
        <DialogTitle>Удалить профиль?</DialogTitle>
        <DialogContent>
          <Typography>
            Вы действительно хотите удалить этот профиль? Это действие нельзя отменить.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, profileId: null })}>Отмена</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Удалить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProfilesPage;
