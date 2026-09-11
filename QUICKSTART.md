# 🚀 Быстрый старт — Mercury-Soft-2 (v3.0.0)

## На macOS/Linux (разработка)

```bash
# 1. Установка
npm install

# 2. Настройка окружения
cp .env.example .env

# 3. Запуск разработки (API + Electron + Browser)
npm run dev

# 4. Запуск Electron
cd packages/client && npm run electron:start
```

## Сервисы

| Сервис | Порт | Описание |
|--------|------|----------|
| API | 3001 | Express + SQL.js |
| Electron Vite | 5173 | Frontend для Raspberry Pi |
| Browser Vite | 3000 | Веб-клиент (адаптивный) |

## На Raspberry Pi 4

```bash
# 1. Установка Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Развёртывание
scp -r Mercury pi@<raspberry-ip>:~/
ssh pi@<raspberry-ip>
cd Mercury
npm install
npm run build

# 3. Запуск API
cd packages/api && pm2 start dist/index.js --name mercury-api
pm2 save && pm2 startup

# 4. Автоматический запуск
sudo systemctl enable mercury
sudo systemctl start mercury
```

## Проверка

```bash
# Health check
curl http://localhost:3001/api/health

# Список профилей
curl http://localhost:3001/api/thermal-profiles
```

## Команды

| Команда | Описание |
|---------|----------|
| `npm install` | Установка зависимостей |
| `npm run dev` | Запуск всех сервисов (API + Electron + Browser) |
| `npm run dev:api` | Только API |
| `npm run dev:client` | Только Electron клиент |
| `npm run dev:browser` | Только браузерный клиент |
| `npm run build` | Сборка всех пакетов |
| `npm run build:browser` | Сборка браузерного клиента |
| `npm run electron:start` | Запуск Electron |
| `npm run electron:dev` | Electron с автоперезагрузкой |

## Структура проекта

```
Mercury/
├── packages/
│   ├── shared/           ← TypeScript типы и интерфейсы
│   ├── api/              ← Express REST API + SQLite
│   ├── client/           ← Electron + React (Raspberry Pi, 480×320)
│   └── browser/          ← React + Vite (Web, адаптивный)
└── data/                 ← База данных mercury.db
```

## Три клиента

### 1. Electron (Raspberry Pi)
- Фиксированный экран 480×320
- Встроенный сенсорный экран печи
- URL: `http://localhost:5173` (Vite dev)

### 2. Browser (Web)
- Адаптивный дизайн
- Удаленное управление через браузер
- URL: `http://localhost:3000` (dev) или `http://IP_ПЕЧИ:8075` (production)

### 3. Mobile (React Native)
- В планах

## API Endpoints

| Endpoint | Метод | Описание |
|----------|-------|----------|
| `/api/health` | GET | Проверка работоспособности |
| `/api/thermal-profiles` | GET | Список профилей |
| `/api/thermal-profiles` | POST | Создание профиля |
| `/api/thermal-profiles/:id` | PUT | Обновление профиля |
| `/api/thermal-profiles/:id` | DELETE | Удаление профиля |
| `/api/furnace` | GET | Состояние печи |
| `/api/sensors` | GET | Датчики температуры |
| `/api/heaters` | GET | Нагреватели |
| `/api/users/me` | GET | Текущий пользователь |

## Страницы приложения

1. **Главная** — режим ожидания / режим работы (объединены в HomePage)
2. **Настройки** — компоненты, калибровка, оповещения
3. **Редактирование профиля** — стадии термопрофиля
4. **Создание профиля** — выбор шаблона, параметры
5. **Системные настройки** — информация о системе, сеть, датчики
6. **Сетевые настройки** — Wi-Fi, параметры подключения, удаленный доступ

## Удаленное управление

```
http://IP-АДРЕС_ПЕЧИ:8075
```

Например: `http://10.10.1.82:8075`
