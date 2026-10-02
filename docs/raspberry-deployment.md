# Raspberry Pi

Испытательная установка: Debian 12 ARM64, пользователь `pi`, Xorg `DISPLAY=:0`,
резистивный дисплей 480×320. Контроллер подключён через `/dev/serial0`.

Исходники и сборка находятся в `/home/pi/mercury-v3`. Зависимости устанавливаются
на Raspberry Pi; Windows `node_modules` не переносится.

`scripts/raspberry-install.sh` устанавливает проверенную по SHA-256 официальную
сборку Node.js 24.21.0 ARM64, pnpm 11.25.0 и собирает пакеты последовательно.
Первый запуск использует виртуальную плату. Параметры в `.env`:

```dotenv
MERCURY_CONTROLLER_MODE=simulation
MERCURY_SERIAL_PORT=/dev/serial0
MERCURY_API_PORT=3001
MERCURY_WEB_PORT=5173
MERCURY_PANEL_FULLSCREEN=true
MERCURY_PANEL_SOFTWARE_RENDERING=true
```

Для реального контроллера используется `MERCURY_CONTROLLER_MODE=hardware`.
Одновременно запускать старое и новое ПО с реальной платой нельзя.

Пользовательская служба `deploy/raspberry/mercury-v3.service` запускает сервер и
Electron вместе через `scripts/raspberry-start.sh`. Настройка предназначена для
установки в указанную папку под пользователем `pi`.

```sh
systemctl --user status mercury-v3
journalctl --user -u mercury-v3 -n 80 --no-pager
curl http://127.0.0.1:3001/api/health
```

Старое ПО остаётся в `/opt/mercury-v2`. Для возврата:

```sh
systemctl --user disable --now mercury-v3
systemctl --user enable --now mercury-v2
```

Для нового ПО:

```sh
systemctl --user disable --now mercury-v2
systemctl --user enable --now mercury-v3
```

Пользовательские профили старого ПО автоматически не импортируются. Выполнение
профиля нагрева пока не реализовано.

Проверка установки 2 октября 2026: новая служба включена в автозапуск,
используется режим `hardware`, плата отвечает через `/dev/serial0` и находится
в состоянии `WORKING`. Проверены реальные температуры, работа конвекционного
вентилятора и полноэкранный интерфейс 480×320 по снимку дисплея. Нагреватели
не включались. Пользователь подтвердил успешный запуск после перезапуска печи.
Физический сенсор ещё нужно проверить.
