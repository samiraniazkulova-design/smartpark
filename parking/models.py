from decimal import Decimal

from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models
from django.db.models import Q


class CustomUser(AbstractUser):
    phone = models.CharField("Телефон", max_length=20, blank=True)
    is_phone_verified = models.BooleanField("Телефон подтвержден", default=False)
    wallet_balance = models.DecimalField("Баланс кошелька", max_digits=10, decimal_places=2, default=0)

    class Meta:
        verbose_name = "пользователь"
        verbose_name_plural = "пользователи"


class ParkingLocation(models.Model):
    name = models.CharField("Название", max_length=160)
    address = models.CharField("Адрес", max_length=255)
    latitude = models.DecimalField(
        "Широта", max_digits=9, decimal_places=6,
        validators=[MinValueValidator(-90), MaxValueValidator(90)],
    )
    longitude = models.DecimalField(
        "Долгота", max_digits=9, decimal_places=6,
        validators=[MinValueValidator(-180), MaxValueValidator(180)],
    )
    total_spots = models.PositiveIntegerField("Всего мест", default=0)
    price = models.DecimalField("Цена за час", max_digits=8, decimal_places=2, default=100.00)

    class Meta:
        ordering = ["name"]
        verbose_name = "парковка"
        verbose_name_plural = "парковки"

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if self.name.strip().casefold() == "asia mall".casefold():
            self.price = Decimal("0.00")
        else:
            self.price = Decimal("100.00")
        super().save(*args, **kwargs)

    @property
    def free_spots(self):
        return self.spots.filter(is_occupied=False).count()

    @property
    def first_free_spot_id(self):
        return self.spots.filter(is_occupied=False).values_list("id", flat=True).first()

    @property
    def price_display(self):
        return "Free" if self.price == Decimal("0.00") else f"{self.price} som"


class ParkingSpot(models.Model):
    location = models.ForeignKey(
        ParkingLocation, on_delete=models.CASCADE, related_name="spots", verbose_name="парковка"
    )
    number = models.PositiveIntegerField("Номер места")
    is_occupied = models.BooleanField("Занято", default=False)

    class Meta:
        ordering = ["number"]
        constraints = [
            models.UniqueConstraint(fields=["location", "number"], name="unique_spot_per_location")
        ]
        verbose_name = "парковочное место"
        verbose_name_plural = "парковочные места"

    def __str__(self):
        return f"{self.location.name} / место {self.number}"


class Booking(models.Model):
    PAYMENT_METHODS = {
        "wallet": "Wallet",
        "mbank": "MBank QR",
        "optima": "Optima QR",
        "card": "Bank card",
    }

    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name="bookings", verbose_name="пользователь")
    spot = models.ForeignKey(ParkingSpot, on_delete=models.CASCADE, related_name="bookings", verbose_name="место")
    start_time = models.DateTimeField("Начало")
    end_time = models.DateTimeField("Окончание")
    is_active = models.BooleanField("Активно", default=True)
    payment_method = models.CharField("Способ оплаты", max_length=20, choices=PAYMENT_METHODS, default="wallet")
    payment_status = models.CharField("Статус оплаты", max_length=20, default="paid")
    amount = models.DecimalField("Сумма", max_digits=10, decimal_places=2, default=0)
    created_at = models.DateTimeField("Создано", auto_now_add=True)

    class Meta:
        ordering = ["-start_time"]
        indexes = [
            models.Index(fields=["spot", "is_active", "end_time"], name="booking_spot_active_idx"),
            models.Index(fields=["user", "is_active", "start_time"], name="booking_user_active_idx"),
        ]
        constraints = [
            models.CheckConstraint(condition=Q(end_time__gt=models.F("start_time")), name="booking_end_after_start")
        ]
        verbose_name = "бронь"
        verbose_name_plural = "брони"

    def __str__(self):
        return f"{self.user} - {self.spot}"


class VerificationCode(models.Model):
    PURPOSES = {"signup": "Signup", "login": "Login"}

    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name="verification_codes")
    code_hash = models.CharField(max_length=128)
    purpose = models.CharField(max_length=20, choices=PURPOSES)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class SavedCard(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, related_name="saved_cards")
    holder_name = models.CharField(max_length=120)
    last_four = models.CharField(max_length=4)
    expiry = models.CharField(max_length=5)
    is_default = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"**** {self.last_four}"
