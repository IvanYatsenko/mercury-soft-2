import { Container, Link, Stack, Typography } from '@mui/material';

export function App() {
  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Stack spacing={3}>
        <Typography component="h1" variant="h3">
          Mercury
        </Typography>
        <Typography variant="h6">Печь оплавления · учебный проект</Typography>
        <Typography color="text.secondary">
          Шаблон готов. Первый этап — модель температурного профиля на
          TypeScript.
        </Typography>
        <Link href="/api/health">Проверить подключение к API</Link>
      </Stack>
    </Container>
  );
}
