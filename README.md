# SmartPark Bishkek

Django-сервис для поиска парковок Бишкека, выбора конкретного места и бронирования через Fetch API. Интерфейс mobile-first поддерживает русский, кыргызский и английский языки, карту Leaflet/OpenStreetMap, light/dark theme, профиль пользователя, UI-звуки с mute-переключателем и PWA manifest для установки на мобильное устройство.

## Запуск

```powershell
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_parking
python manage.py createsuperuser
python manage.py runserver
```

Откройте `http://127.0.0.1:8000/`. Команда `seed_parking` создаёт пять локаций: Asia Mall, Bishkek Park, Dordoi Plaza, Vefa Center и Beta Stores. Asia Mall бесплатный, остальные зоны стоят 100 сом/час.

## Основные API

- `POST /api/auth/signup/` — регистрация и OTP.
- `POST /api/auth/login/` — вход по email или телефону.
- `POST /api/auth/verify/` — подтверждение OTP.
- `GET /api/locations/status/` — актуальные статусы мест.
- `POST /api/bookings/` — создание бронирования без перезагрузки.
- `POST /api/bookings/<id>/cancel/` — отмена брони и возврат wallet-платежа.
- `GET /api/bookings/history/` — история пользователя.
- `POST /api/profile/` — обновление профиля.
- `POST /api/profile/password/` — смена пароля через Django validators.

## PWA и offline

После первого открытия браузер регистрирует `/sw.js`. Static assets и последняя загруженная главная страница доступны из cache при временном отсутствии сети. API-запросы намеренно не кэшируются, чтобы статусы мест и бронирования оставались актуальными.

Кнопка с символом ноты в header включает или выключает UI-звуки. Выбор сохраняется в браузере.

## Проверка

```powershell
python manage.py check
python manage.py test parking
```

Для production задайте случайный `DJANGO_SECRET_KEY` длиной не менее 50 символов, `DJANGO_DEBUG=False`, `DJANGO_ALLOWED_HOSTS` (список через запятую) и используйте PostgreSQL/HTTPS. При `DJANGO_DEBUG=False` автоматически включаются secure cookies, HTTPS redirect, HSTS и security headers. Без `DJANGO_SECRET_KEY` production-сервер не запускается. Статические файлы собираются командой `python manage.py collectstatic`.
