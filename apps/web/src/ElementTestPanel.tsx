import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Typography,
} from '@mui/material';
import type { OvenSelection } from '@mercury/shared';

type TestElement = { name: string; label: string };

type ElementTestPanelProps = {
  selected: OvenSelection;
  draft: { ovenModel: string | null; connectionVoltage: string | null };
  connected: boolean;
  ready: boolean;
  simulated: boolean;
  convectionOn: boolean;
  boardType?: '220V' | '230V' | '380V' | 'unknown' | undefined;
};

export function ElementTestPanel({
  selected,
  draft,
  connected,
  ready,
  simulated,
  convectionOn,
  boardType,
}: ElementTestPanelProps) {
  const [elements, setElements] = useState<TestElement[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [testing, setTesting] = useState(false);
  const unsaved = draft.ovenModel !== selected.ovenModel;
  const boardUnknown = !simulated && connected && boardType === 'unknown';
  const unavailable =
    unsaved || !connected || !ready || boardUnknown || testing;
  const parallelFans =
    selected.ovenModel === '300' &&
    (simulated || boardType === '230V' || boardType === '380V');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/controller/test-elements', {
          signal: controller.signal,
        });
        const result = (await response.json()) as {
          elements?: TestElement[];
          error?: string;
        };
        if (!response.ok || !result.elements) {
          throw new Error(result.error ?? 'Не удалось загрузить элементы.');
        }
        if (!controller.signal.aborted) {
          setElements(result.elements);
          setError('');
        }
      } catch (loadError) {
        if (!controller.signal.aborted)
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Сервер недоступен.',
          );
      }
    }
    void load();
    return () => controller.abort();
  }, [selected.ovenModel, boardType, simulated]);

  async function runTest(element: TestElement) {
    setTesting(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/controller/test-element', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: element.name }),
      });
      const result = (await response.json()) as {
        success?: boolean;
        simulated?: boolean;
        error?: string;
      };
      if (!response.ok || !result.success)
        throw new Error(result.error ?? 'Проверка не выполнена.');
      setNotice(
        result.simulated
          ? `Симуляция: ${element.label} проверен.`
          : `${element.label}: проверка завершена.`,
      );
    } catch (testError) {
      setError(
        testError instanceof Error
          ? testError.message
          : 'Проверка не выполнена.',
      );
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card variant="outlined">
      <CardContent sx={{ p: '10px !important' }}>
        <Typography variant="subtitle1" fontWeight={700}>
          Проверка элементов
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          Один элемент на 3 секунды. После проверки выход выключается.
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          Печь {selected.ovenModel} · подключение {selected.connectionVoltage} В
          · плата {simulated ? 'виртуальная' : (boardType ?? 'не определена')}
        </Typography>
        {unsaved && <Alert severity="info">Сначала сохрани модель печи.</Alert>}
        {!connected && <Alert severity="warning">Нет связи с платой.</Alert>}
        {connected && !ready && (
          <Alert severity="warning">Плата не готова.</Alert>
        )}
        {boardUnknown && (
          <Alert severity="warning">Не удалось определить тип платы.</Alert>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 0.75,
            mt: 1,
          }}
        >
          {elements
            .filter((element) => !(parallelFans && element.name === 'f2'))
            .map((element) => (
              <Button
                key={element.name}
                variant="outlined"
                disabled={
                  unavailable || (element.name === 'convection' && convectionOn)
                }
                onClick={() => void runTest(element)}
                sx={{ minHeight: 48, fontSize: 11, lineHeight: 1.2 }}
              >
                {parallelFans && element.name === 'f1'
                  ? 'Вентиляторы охлаждения'
                  : element.label}
              </Button>
            ))}
        </Box>
        {testing && (
          <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
            Проверка выполняется…
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
