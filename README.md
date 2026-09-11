# Mercury-Soft-2 — Руководство по эксплуатации ПО (v3.0.0)

## Описание

Кроссплатформенное приложение для управления конвекционными печами оплавления **Меркурий-301** и **Меркурий-401**.

Предназначено для опытного и мелкосерийного производства печатных плат. Использует комбинированную систему нагрева (ТЭНы, ИК-лампы, конвекция) для равномерного и быстрого нагрева.

## Архитектура

```
Mercury/                          ← Монорепозиторий
├── .env                          ← Переменные окружения (не коммитится)
├── .env.example                  ← Шаблон переменных окружения
├── .gitignore                    ← Исключения для Git
├── package.json                  ← Корневой npm workspace
├── tsconfig.json                 ← Общий конфиг TypeScript
├── data/                         ← База данных SQLite
│   └── mercury.db
├── description/                  ← Документация и макеты
│   ├── desc.txt                  ← Руководство по эксплуатации
│   └── view/
│       └── panel_480x320/        ← HTML макеты интерфейса
├── README.md                     ← Эта документация
├── QUICKSTART.md                 ← Быстрый старт
└── packages/                     ← Пакеты npm
    ├── shared/                   ← ОБЩИЙ СЛОЙ — типы и константы
    │   ├── src/
    │   │   ├── index.ts          ← Главный экспорт
    │   │   ├── interfaces/       ← Интерфейсы
    │   │   │   ├── Furnace.interface.ts
    │   │   │   ├── ThermalProfile.interface.ts
    │   │   │   ├── Temperature.interface.ts
    │   │   │   ├── Sensor.interface.ts
    │   │   │   ├── Heater.interface.ts
    │   │   │   ├── OvenSettings.interface.ts
    │   │   │   └── User.interface.ts
    │   │   └── constants/        ← Константы
    │   │       └── api.constants.ts
    │   ├── package.json
    │   └── tsconfig.json
    ├── api/                      ← БЭКЕНД — Express + SQL.js
    │   ├── src/
    │   │   └── index.ts          ← Сервер, маршруты, БД
    │   ├── package.json
    │   └── tsconfig.json
    ├── client/                   ← КЛИЕНТ 1 — Electron + React (Raspberry Pi)
    │   ├── electron/             ← Electron main process
    │   │   ├── main.ts           ← Создание окна 480×320
    │   │   └── preload.ts        ← Безопасный API
    │   ├── src/                  ← React приложение
    │   │   ├── main.tsx          ← Точка входа (ReactDOM)
    │   │   ├── App.tsx           ← Рендеринг HomePage
    │   │   ├── components/       ← Переиспользуемые компоненты
    │   │   │   └── PanelLayout.tsx ← Общий макет с grid
    │   │   ├── context/          ← Контексты (темы)
    │   │   │   └── ThemeContext.tsx
    │   │   ├── pages/            ← Страницы
    │   │   │   ├── HomePage.tsx              ← Главная (ожидание/работа)
    │   │   │   ├── SettingsPage.tsx          ← Настройки компонентов
    │   │   │   ├── ProfileEditPage.tsx       ← Редактирование профиля
    │   │   │   ├── ProfileCreatePage.tsx     ← Создание профиля
    │   │   │   ├── SystemSettingsPage.tsx    ← Системные настройки
    │   │   │   └── NetworkSettingsPage.tsx   ← Сетевые настройки
    │   │   └── services/         ← Сервисы
    │   │       └── MockBoardService.ts       ← Симуляция печи
    │   ├── vite.config.ts        ← Vite конфиг (порт 5173)
    │   ├── tsconfig.json         ← TS конфиг для React
    │   ├── tsconfig.electron.json ← TS конфиг для Electron
    │   └── index.html            ← HTML шаблон
    └── browser/                  ← КЛИЕНТ 2 — Веб-приложение (адаптивное)
        ├── src/
        │   ├── main.tsx          ← Точка входа
        │   ├── App.tsx           ← React Router + маршруты
        │   ├── components/
        │   │   └── PanelLayout.tsx ← Адаптивный макет
        │   ├── context/
        │   │   └── ThemeContext.tsx
        │   ├── pages/            ← Те же страницы, адаптивные
        │   │   ├── HomePage.tsx
        │   │   ├── SettingsPage.tsx
        │   │   ├── ProfileEditPage.tsx
        │   │   ├── ProfileCreatePage.tsx
        │   │   ├── SystemSettingsPage.tsx
        │   │   └── NetworkSettingsPage.tsx
        │   └── services/
        │       └── api.ts        ← API клиент
        ├── vite.config.ts        ← Vite конфиг (порт 3000)
        ├── package.json
        ├── tsconfig.json
        └── index.html
```

## Три клиента

### 1. Electron клиент (Raspberry Pi)
- **Пакет:** `packages/client/`
- **Экран:** фиксированный 480×320 (3.5" touchscreen)
- **Стек:** Electron + React + TypeScript + MUI
- **Назначение:** Встроенный сенсорный экран печи
- **Особенности:** Frameless окно, фиксированный размер, без адаптивности

### 2. Браузерный клиент (Web)
- **Пакет:** `packages/browser/`
- **Экран:** адаптивный (responsive)
- **Стек:** React + TypeScript + MUI + Vite
- **Назначение:** Удаленное управление через веб-браузер
- **Порт:** 3000
- **Особенности:** 
  - Mobile (<600px): одна колонка
  - Tablet (600-960px): две колонки
  - Desktop (>960px): три колонки
  - URL: `http://IP-АДРЕС_ПЕЧИ:8075`

### 3. Мобильное приложение (React Native)
- **Статус:** в планах
- **Назначение:** Управление со смартфона/планшета

## Требования

### Для разработки (macOS/Linux)
- Node.js >= 18.x
- npm >= 9.x

### Для Raspberry Pi 4 (Electron клиент)
- Raspberry Pi OS (64-bit, Bullseye или новее)
- 3.5" Touchscreen Display (320×480)
- Node.js >= 18.x
- npm >= 9.x
- X11/Wayland (для отображения Electron окна)

## Быстрый старт (разработка на macOS/Linux)

### 1. Установка зависимостей

```bash
cd Mercury
npm install
```

### 2. Настройка переменных окружения

```bash
# Создать .env из шаблона
cp .env.example .env

# Отредактировать .env (опционально)
nano .env
```

### 3. Запуск в режиме разработки

```bash
# Запуск всех сервисов (API + Client + Browser)
npm run dev
```

Это запустит:
- **API сервер** на `http://localhost:3001`
- **Electron Vite dev server** на `http://localhost:5173`
- **Browser Vite dev server** на `http://localhost:3000`

### 4. Запуск отдельных сервисов

```bash
# Только API
npm run dev:api

# Только Electron клиент
npm run dev:client

# Только браузерный клиент
npm run dev:browser
```

### 5. Запуск Electron

```bash
# Терминал 1 — фронтенд
cd packages/client && npm run dev

# Терминал 2 — Electron
cd packages/client && npm run electron:start
```

Или одним скриптом:
```bash
cd packages/client && npm run electron:dev
```

### 6. Проверка работы

```bash
# Health check
curl http://localhost:3001/api/health

# Получение списка термопрофилей
curl http://localhost:3001/api/thermal-profiles

# Создание нового профиля
curl -X POST http://localhost:3001/api/thermal-profiles \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Мой профиль",
    "stages": [
      {"second": 60, "temperature": 150},
      {"second": 90, "temperature": 217},
      {"second": 30, "temperature": 245}
    ],
    "mode": "manual",
    "useExternalSensor": false,
    "shelves": {"time": 60, "temperature": 150}
  }'
```

## Структура команд

### Разработка

```bash
# Установка зависимостей
npm install

# Запуск всех сервисов
npm run dev

# Запуск только API
npm run dev:api

# Запуск только Electron клиента
npm run dev:client

# Запуск только браузерного клиента
npm run dev:browser

# Запуск Electron
cd packages/client && npm run electron:start
```

### Сборка

```bash
# Сборка всех пакетов
npm run build

# Сборка API
npm run build:api

# Сборка Electron клиента
npm run build:client

# Сборка браузерного клиента
npm run build:browser
```

## Страницы приложения

### 1. Главная — `HomePage.tsx`

Объединяет два режима в одной странице:

**Режим ожидания (isRunning = false):**
- Текущая температура камеры
- Статус компонентов (ТЭНы, вентиляторы, ИК-лампы)
- Кнопки: ПУСК, НАСТРОЙКИ, ПРОФИЛИ
- Список термопрофилей для выбора
- Быстрые действия: создать, импортировать, калибровка
- Статус: "Готов к работе"

**Режим работы (isRunning = true):**
- Текущая температура
- Статус компонентов (активные/неактивные)
- Кнопка СТОП
- Таймер до конца программы
- Информация о текущей стадии
- Прогресс выполнения
- График термопрофиля
- Текущие показатели (датчик, мощность, обороты)

### 2. Настройки — `SettingsPage.tsx`
- Разделы: Компоненты, Калибровка, Оповещения, Сеть, Система
- Управление нагревателями (переключатели)
- Управление вентиляторами (переключатели)
- Управление ИК-лампами (переключатели)
- Дополнительные настройки
- Информация о системе

### 3. Редактирование профиля — `ProfileEditPage.tsx`
- Название профиля
- Режим редактирования (Детальный/Упрощенный)
- Таблица стадий с полями ввода
- Кнопки управления стадиями (вверх/вниз/удалить)
- Валидация скорости нагрева
- Итоговая информация
- Кнопки: Сохранить, Копировать, Удалить

### 4. Создание профиля — `ProfileCreatePage.tsx`
- Название профиля
- Тип пасты (Свинцовая/Бессвинцовая)
- Режим (Детальный/Упрощенный)
- Выбор шаблона с предпросмотром
- Подсказки
- Кнопки: Создать, Отмена

### 5. Системные настройки — `SystemSettingsPage.tsx`
- Информация о системе (модель, серийный номер, версия ПО)
- Тип сети (Однофазная/Трехфазная)
- Параметры (частота, звуки, автосохранение)
- Датчики (основной, дополнительный)
- Служебные действия (экспорт логов, очистка кэша, обновления)

### 6. Сетевые настройки — `NetworkSettingsPage.tsx`
- Список доступных Wi-Fi сетей
- Текущий IP-адрес
- Параметры подключения (IP, маска, шлюз, порт)
- Удаленный доступ (URL, статус, QR-код)

## API Endpoints

### Health
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/health` | Проверка работоспособности |

### Thermal Profiles
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/thermal-profiles` | Получение списка профилей |
| GET | `/api/thermal-profiles/:id` | Получение одного профиля |
| POST | `/api/thermal-profiles` | Создание нового профиля |
| PUT | `/api/thermal-profiles/:id` | Обновление профиля |
| DELETE | `/api/thermal-profiles/:id` | Удаление профиля |

### Furnace Status
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/furnace` | Текущее состояние печи |

### Sensors
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/sensors` | Список датчиков температуры |

### Heaters
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/heaters` | Список нагревателей |

### Users
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/users/me` | Текущий пользователь |

## Форматы данных

### Создание термопрофиля
```json
{
  "name": "Стандартный (Lead-Free)",
  "stages": [
    {"second": 60, "temperature": 150},
    {"second": 90, "temperature": 217},
    {"second": 30, "temperature": 245},
    {"second": 60, "temperature": 100}
  ],
  "mode": "manual",
  "useExternalSensor": false,
  "shelves": {
    "time": 60,
    "temperature": 150
  }
}
```

### Ответ сервера
```json
{
  "id": "uuid",
  "name": "Стандартный (Lead-Free)",
  "stages": [
    {"second": 60, "temperature": 150},
    {"second": 90, "temperature": 217}
  ],
  "mode": "manual",
  "useExternalSensor": false,
  "shelves": {"time": 60, "temperature": 150},
  "createdAt": "2026-09-10T07:00:00.000Z",
  "updatedAt": "2026-09-10T07:00:00.000Z"
}
```

## Переменные окружения

| Переменная | Описание | Значение по умолчанию |
|------------|----------|----------------------|
| `API_PORT` | Порт API сервера | `3001` |
| `VITE_PORT` | Порт Vite dev server (Electron) | `5173` |
| `VITE_API_URL` | URL API для фронтенда | `http://localhost:3001/api` |
| `DB_PATH` | Путь к базе данных | `./data/mercury.db` |
| `NODE_ENV` | Режим работы | `development` |
| `JWT_SECRET` | Секрет для JWT токенов | `your-secret-key` |
| `JWT_EXPIRES_IN` | Срок действия access токена | `15m` |
| `REFRESH_SECRET` | Секрет для refresh токенов | `your-refresh-secret` |
| `REFRESH_EXPIRES_IN` | Срок действия refresh токена | `7d` |

## Типы данных

### FurnaceStatus
- `IDLE` — Печь выключена или простаивает
- `WORK` — Печь выполняет рабочий цикл
- `BUSY` — Печь занята
- `ERROR` — Произошла ошибка

### FurnaceErrorType
- `INFO` — Информационное сообщение
- `WARNING` — Предупреждение
- `CRITICAL` — Критическая ситуация
- `FAILURE` — Аварийная ситуация

### SensorType
- `PRIMARY` — Основной датчик (у дальней стенки)
- `SECONDARY` — Дополнительный датчик (сверху камеры)

### HeaterType
- `HEATING_ELEMENT` — Трубчатый электронагреватель
- `INFRARED_LAMP` — Инфракрасная лампа
- `CONVECTION_FAN` — Вентилятор конвекции
- `COOLING_FAN` — Вентилятор охлаждения

### UserRole
- `OPERATOR` — Оператор (базовый доступ)
- `ENGINEER` — Инженер (создание профилей)
- `ADMIN` — Администратор (полный доступ)

## Удаленное управление через Web-браузер

Удаленное управление за печью позволяет:
- Наблюдать процесс работы печи
- Изменять настройки
- Экспортировать из печи термопрофили
- Импортировать в печь термопрофили

Для возможности удаленного управления печью, нужно печь подключить к WiFi сети. После подключения к WiFi сети, необходимо узнать IP-адрес печи.

Открыть в Web-браузере следующий адрес: `http://IP-АДРЕС_ПЕЧИ:8075`, например: `http://10.10.1.82:8075`.

## Отладка

### Логи

```bash
# Логи API
cd packages/api && npm run dev

# Логи Vite (режим разработки)
# Вывод в терминале, где запущен Vite
```

### Частые проблемы

**1. Белый экран в Electron**
- Убедитесь, что Vite запущен на порту 5173
- Проверьте `NODE_ENV=development`
- Проверьте консоль DevTools (Ctrl+Shift+I)

**2. API не отвечает**
- Проверьте, что API запущен: `curl http://localhost:3001/api/health`
- Проверьте логи: `cd packages/api && npm run dev`

**3. Ошибки компиляции TypeScript**
```bash
# Очистка и переустановка
rm -rf node_modules packages/*/node_modules
npm install
npm run build
```

**4. Проблемы с дисплеем на Raspberry Pi**
```bash
# Проверка разрешения
cat /sys/class/graphics/f0/virtual_size

# Перезапуск дисплея
sudo systemctl restart lightdm
```

## Дальнейшее развитие

### В процессе
- [x] Electron клиент (Raspberry Pi)
- [x] Браузерный клиент (Web)
- [ ] Интеграция с реальным API
- [ ] Навигация между страницами
- [ ] Интеграция MockBoardService

### Планируется
- [ ] React Native клиент для мобильных устройств
- [ ] CI/CD пайплайн (GitHub Actions)
- [ ] Автоматическая сборка .deb пакетов для Raspberry Pi
- [ ] Аутентификация и авторизация (JWT)
- [ ] WebSocket для real-time обновлений
- [ ] Тесты (Jest + React Testing Library)
- [ ] Docker контейнеризация

### Технологический стек
- **Electron клиент:** Electron 28 + React 18 + TypeScript
- **Browser клиент:** React 18 + TypeScript + Vite
- **UI:** MUI (Material-UI) v5
- **State:** MobX + mobx-react-lite
- **Роутинг:** React Router v6
- **Бэкенд:** Express + TypeScript
- **БД:** SQLite (SQL.js)
- **Сборка:** Vite + tsc
- **Monorepo:** npm workspaces

## Лицензия

АМСГ.421415.120 РЭ — Руководство по эксплуатации конвекционных печей оплавления Меркурий-301 и Меркурий-401
