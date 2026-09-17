import hashlib
import json
import secrets
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout
from django.contrib.auth.decorators import login_required
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import transaction
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.utils import timezone
from django.views.decorators.http import require_POST

from .models import Booking, CustomUser, ParkingLocation, ParkingSpot, SavedCard, VerificationCode


def _json_body(request):
    try:
        return json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return None


def _normalize_phone(phone):
    digits = "".join(char for char in str(phone) if char.isdigit())
    if digits.startswith("0") and len(digits) == 10:
        digits = "996" + digits[1:]
    if digits.startswith("996") and len(digits) == 12:
        return f"+{digits}"
    return str(phone).strip()


def _issue_otp(user, purpose):
    code = f"{secrets.randbelow(1_000_000):06d}"
    VerificationCode.objects.filter(user=user, purpose=purpose).delete()
    VerificationCode.objects.create(
        user=user,
        purpose=purpose,
        code_hash=hashlib.sha256(code.encode()).hexdigest(),
        expires_at=timezone.now() + timedelta(minutes=5),
    )
    return code


def _clear_expired_spot_booking(spot, now):
    expired = spot.bookings.filter(is_active=True, end_time__lte=now).update(is_active=False)
    if expired and spot.is_occupied:
        spot.is_occupied = False
        spot.save(update_fields=["is_occupied"])


def index(request):
    locations = ParkingLocation.objects.prefetch_related("spots").all()
    bookings = []
    if request.user.is_authenticated:
        bookings = request.user.bookings.select_related("spot__location").all()[:10]
    locations_data = [
        {
            "id": location.id,
            "name": location.name,
            "address": location.address,
            "latitude": float(Decimal(str(location.latitude))),
            "longitude": float(Decimal(str(location.longitude))),
            "free_spots": location.free_spots,
            "first_free_spot_id": location.spots.filter(is_occupied=False).values_list("id", flat=True).first(),
            "spots": [
                {"id": spot.id, "number": spot.number, "is_occupied": spot.is_occupied}
                for spot in location.spots.all()
            ],
            "price": float(location.price),
            "price_label": location.price_display,
        }
        for location in locations
    ]
    return render(request, "parking/index.html", {
        "locations": locations,
        "locations_data": locations_data,
        "saved_card": request.user.saved_cards.filter(is_default=True).first() if request.user.is_authenticated else None,
        "bookings": bookings,
    })


def service_worker(request):
    script = """
const CACHE_NAME = 'smartpark-static-v2';
self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )).then(() => self.clients.claim())
    );
});
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
        if (event.request.mode === 'navigate') {
            event.respondWith(fetch(event.request).then((response) => {
                if (response.ok) {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
                }
                return response;
            }).catch(() => caches.match('/')));
            return;
        }
    if (url.pathname.startsWith('/static/')) {
        event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
            const cached = await cache.match(event.request);
            if (cached) return cached;
            const response = await fetch(event.request);
            if (response.ok) cache.put(event.request, response.clone());
            return response;
        }));
    }
});
"""
    return HttpResponse(script, content_type="application/javascript")


@login_required
def booking_history(request):
    bookings = request.user.bookings.select_related("spot__location").all()[:20]
    return JsonResponse({
        "bookings": [
            {
                "id": booking.id,
                "location": booking.spot.location.name,
                "spot": booking.spot.number,
                "start": booking.start_time.isoformat(),
                "end": booking.end_time.isoformat(),
                "amount": float(booking.amount),
                "payment_status": booking.payment_status,
                "is_active": booking.is_active,
            }
            for booking in bookings
        ]
    })


def locations_status(request):
    locations = ParkingLocation.objects.prefetch_related("spots").all()
    now = timezone.now()
    status_data = []
    for location in locations:
        spots = list(location.spots.all())
        for spot in spots:
            _clear_expired_spot_booking(spot, now)
        status_data.append({
            "id": location.id,
            "free_spots": sum(not spot.is_occupied for spot in spots),
            "spots": [
                {"id": spot.id, "is_occupied": spot.is_occupied}
                for spot in spots
            ],
        })
    return JsonResponse({
        "locations": status_data
    })


@require_POST
@login_required
def update_profile(request):
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "Invalid JSON."}, status=400)
    full_name = str(data.get("full_name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    phone = _normalize_phone(data.get("phone", ""))
    if not full_name or not email or not phone:
        return JsonResponse({"error": "Заполните имя, email и телефон."}, status=400)
    if CustomUser.objects.filter(email=email).exclude(pk=request.user.pk).exists():
        return JsonResponse({"error": "Этот email уже используется."}, status=409)
    if CustomUser.objects.filter(phone=phone).exclude(pk=request.user.pk).exists():
        return JsonResponse({"error": "Этот телефон уже используется."}, status=409)
    first_name, _, last_name = full_name.partition(" ")
    request.user.first_name = first_name
    request.user.last_name = last_name
    request.user.email = email
    request.user.phone = phone
    request.user.save(update_fields=["first_name", "last_name", "email", "phone"])
    return JsonResponse({"ok": True, "full_name": request.user.get_full_name(), "email": email, "phone": phone})


@require_POST
@login_required
def change_password(request):
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "Invalid JSON."}, status=400)
    current_password = str(data.get("current_password", ""))
    new_password = str(data.get("new_password", ""))
    confirm_password = str(data.get("confirm_password", ""))
    if not request.user.check_password(current_password):
        return JsonResponse({"error": "Текущий пароль указан неверно."}, status=400)
    if len(new_password) < 8 or new_password != confirm_password:
        return JsonResponse({"error": "Новый пароль должен быть от 8 символов и совпадать в обоих полях."}, status=400)
    try:
        validate_password(new_password, request.user)
    except ValidationError as error:
        return JsonResponse({"error": ", ".join(error.messages)}, status=400)
    request.user.set_password(new_password)
    request.user.save(update_fields=["password"])
    auth_login(request, request.user)
    return JsonResponse({"ok": True})


@require_POST
@login_required
def cancel_booking(request, booking_id):
    with transaction.atomic():
        booking = get_object_or_404(
            Booking.objects.select_for_update().select_related("spot"),
            pk=booking_id,
            user=request.user,
            is_active=True,
        )
        booking.is_active = False
        booking.end_time = timezone.now()
        booking.save(update_fields=["is_active", "end_time"])
        if booking.payment_method == "wallet" and booking.payment_status == "paid" and booking.amount:
            request.user.wallet_balance += booking.amount
            request.user.save(update_fields=["wallet_balance"])
        spot = ParkingSpot.objects.select_for_update().get(pk=booking.spot_id)
        spot.is_occupied = False
        spot.save(update_fields=["is_occupied"])
    return JsonResponse({"ok": True, "booking_id": booking.id, "spot_id": spot.id, "is_occupied": False})


@require_POST
def signup(request):
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "Invalid JSON."}, status=400)
    email = str(data.get("email", "")).strip().lower()
    phone = _normalize_phone(data.get("phone", ""))
    full_name = str(data.get("full_name", "")).strip()
    password = str(data.get("password", ""))
    if not email or not phone or not full_name or len(password) < 8:
        return JsonResponse({"error": "Введите имя, email, телефон и пароль от 8 символов."}, status=400)
    try:
        validate_password(password)
    except ValidationError as error:
        return JsonResponse({"error": ", ".join(error.messages)}, status=400)
    if CustomUser.objects.filter(email=email).exists():
        return JsonResponse({"error": "Пользователь с таким email уже существует."}, status=409)
    if CustomUser.objects.filter(phone=phone).exists():
        return JsonResponse({"error": "Пользователь с таким телефоном уже существует."}, status=409)
    first_name, _, last_name = full_name.partition(" ")
    user = CustomUser.objects.create_user(
        username=email,
        email=email,
        password=password,
        first_name=first_name,
        last_name=last_name,
        phone=phone,
    )
    code = _issue_otp(user, "signup")
    response = {"ok": True, "requires_otp": True, "message": "Код отправлен на телефон или email."}
    if settings.DEBUG:
        response["dev_code"] = code
    return JsonResponse(response, status=201)


@require_POST
def login(request):
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "Invalid JSON."}, status=400)
    identifier = str(data.get("email", data.get("phone", ""))).strip().lower()
    if "@" not in identifier:
        identifier = _normalize_phone(identifier)
    password = str(data.get("password", ""))
    user = CustomUser.objects.filter(email=identifier).first() or CustomUser.objects.filter(phone=identifier).first()
    if not user or not user.check_password(password):
        return JsonResponse({"error": "Неверные учетные данные."}, status=401)
    if not user.is_phone_verified:
        code = _issue_otp(user, "login")
        response = {"ok": True, "requires_otp": True, "message": "Подтвердите кодом вход."}
        if settings.DEBUG:
            response["dev_code"] = code
        return JsonResponse(response)
    auth_login(request, user)
    return JsonResponse({"ok": True, "authenticated": True})


@require_POST
def verify_otp(request):
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "Invalid JSON."}, status=400)
    identifier = str(data.get("email", data.get("phone", ""))).strip()
    if "@" not in identifier:
        identifier = _normalize_phone(identifier)
    code = str(data.get("code", "")).strip()
    user = CustomUser.objects.filter(email=identifier.lower()).first() or CustomUser.objects.filter(phone=identifier).first()
    verification = user and VerificationCode.objects.filter(
        user=user, expires_at__gt=timezone.now()
    ).first()
    if not verification or verification.attempts >= 5:
        return JsonResponse({"error": "Код неверный или истек."}, status=400)
    if not secrets.compare_digest(verification.code_hash, hashlib.sha256(code.encode()).hexdigest()):
        verification.attempts += 1
        verification.save(update_fields=["attempts"])
        return JsonResponse({"error": "Код неверный или истек."}, status=400)
    user.is_phone_verified = True
    user.save(update_fields=["is_phone_verified"])
    verification.delete()
    auth_login(request, user)
    return JsonResponse({"ok": True, "authenticated": True})


@require_POST
def logout(request):
    auth_logout(request)
    return JsonResponse({"ok": True})


@require_POST
@login_required
def add_card(request):
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "Invalid JSON."}, status=400)
    card_number = "".join(char for char in str(data.get("card_number", "")) if char.isdigit())
    holder_name = str(data.get("holder_name", "")).strip()
    expiry = str(data.get("expiry", "")).strip()
    if len(card_number) < 12 or not holder_name or len(expiry) != 5:
        return JsonResponse({"error": "Проверьте данные карты."}, status=400)
    request.user.saved_cards.update(is_default=False)
    card = SavedCard.objects.create(
        user=request.user,
        holder_name=holder_name,
        last_four=card_number[-4:],
        expiry=expiry,
    )
    return JsonResponse({"ok": True, "last_four": card.last_four, "expiry": card.expiry})


@require_POST
@login_required
def create_booking(request):
    data = _json_body(request)
    if data is None:
        return JsonResponse({"error": "Invalid JSON."}, status=400)
    spot = get_object_or_404(ParkingSpot.objects.select_related("location"), pk=data.get("spot_id"))
    payment_method = data.get("payment_method", "wallet")
    try:
        duration_hours = int(data.get("duration_hours", 1))
    except (TypeError, ValueError):
        return JsonResponse({"error": "Некорректная длительность."}, status=400)
    if duration_hours not in {1, 2, 3, 4}:
        return JsonResponse({"error": "Длительность должна быть от 1 до 4 часов."}, status=400)
    if payment_method not in Booking.PAYMENT_METHODS:
        return JsonResponse({"error": "Недоступный способ оплаты."}, status=400)
    with transaction.atomic():
        spot = ParkingSpot.objects.select_for_update().select_related("location").get(pk=spot.pk)
        now = timezone.now()
        _clear_expired_spot_booking(spot, now)
        if spot.is_occupied or spot.bookings.filter(is_active=True, end_time__gt=now).exists():
            return JsonResponse({"error": "Место уже занято."}, status=409)
        amount = spot.location.price * duration_hours
        if payment_method == "wallet" and request.user.wallet_balance < amount:
            return JsonResponse({"error": "Недостаточно средств в кошельке."}, status=402)
        if payment_method == "card" and not request.user.saved_cards.filter(is_default=True).exists():
            return JsonResponse({"error": "Сначала добавьте карту."}, status=400)
        if payment_method == "wallet" and amount:
            request.user.wallet_balance -= amount
            request.user.save(update_fields=["wallet_balance"])
        booking = Booking.objects.create(
            user=request.user,
            spot=spot,
            start_time=now,
            end_time=now + timedelta(hours=duration_hours),
            payment_method=payment_method,
            payment_status="paid",
            amount=amount,
        )
        spot.is_occupied = True
        spot.save(update_fields=["is_occupied"])
    return JsonResponse({
        "ok": True,
        "booking_id": booking.id,
        "spot_id": spot.id,
        "amount": float(amount),
        "price_label": spot.location.price_display,
        "free_spots": spot.location.free_spots,
        "duration_hours": duration_hours,
    }, status=201)


@login_required
def spot_status(request, spot_id):
    spot = get_object_or_404(ParkingSpot.objects.select_related("location"), pk=spot_id)
    _clear_expired_spot_booking(spot, timezone.now())
    active_booking = spot.bookings.filter(is_active=True, end_time__gt=timezone.now()).first()
    return JsonResponse({
        "spot_id": spot.id,
        "is_occupied": spot.is_occupied,
        "is_mine": bool(active_booking and active_booking.user_id == request.user.id),
    })


@require_POST
@login_required
def toggle_booking(request, spot_id):
    action = request.POST.get("action", "reserve")
    if action not in {"reserve", "release"}:
        return JsonResponse({"error": "Unknown action."}, status=400)

    with transaction.atomic():
        spot = ParkingSpot.objects.select_for_update().get(pk=spot_id)
        now = timezone.now()
        _clear_expired_spot_booking(spot, now)
        active_booking = spot.bookings.filter(is_active=True, end_time__gt=now).first()

        if action == "reserve":
            if spot.is_occupied or active_booking:
                return JsonResponse({"error": "This spot is already booked."}, status=409)
            Booking.objects.create(
                user=request.user,
                spot=spot,
                start_time=now,
                end_time=now + timedelta(hours=1),
                is_active=True,
                payment_method="wallet" if spot.location.price == 0 else "mbank",
                payment_status="paid",
                amount=spot.location.price,
            )
            spot.is_occupied = True
            spot.save(update_fields=["is_occupied"])
            return JsonResponse({
                "ok": True,
                "is_occupied": True,
                "is_mine": True,
                "price": float(spot.location.price),
                "price_label": spot.location.price_display,
            })

        if not active_booking or active_booking.user_id != request.user.id:
            return JsonResponse({"error": "Only your active booking can be released."}, status=403)
        active_booking.is_active = False
        active_booking.end_time = now
        active_booking.save(update_fields=["is_active", "end_time"])
        spot.is_occupied = False
        spot.save(update_fields=["is_occupied"])
        return JsonResponse({
            "ok": True,
            "is_occupied": False,
            "is_mine": False,
            "price": float(spot.location.price),
            "price_label": spot.location.price_display,
        })
