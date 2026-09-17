# SmartPark Bishkek

Django-сервис для просмотра парковок Бишкека и бронирования мест через Fetch API.

## Запуск

```powershell
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

Откройте `http://127.0.0.1:8000/`. Данные четырёх стартовых парковок создаются миграцией. Для бронирования войдите через `/admin/login/`.

Для production задайте `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=False`, `DJANGO_ALLOWED_HOSTS` (список через запятую) и используйте PostgreSQL/HTTPS. Статические файлы собираются командой `python manage.py collectstatic`.
