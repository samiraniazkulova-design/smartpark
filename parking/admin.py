from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Booking, CustomUser, ParkingLocation, ParkingSpot, SavedCard, VerificationCode


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("Контакты", {"fields": ("phone", "is_phone_verified", "wallet_balance")} ),)
    add_fieldsets = UserAdmin.add_fieldsets + (("Контакты", {"fields": ("phone",)}),)
    list_display = ("username", "email", "phone", "is_staff", "is_active")
    search_fields = ("username", "email", "phone")


class ParkingSpotInline(admin.TabularInline):
    model = ParkingSpot
    extra = 1


@admin.register(ParkingLocation)
class ParkingLocationAdmin(admin.ModelAdmin):
    list_display = ("name", "address", "total_spots", "free_spots")
    search_fields = ("name", "address")
    inlines = (ParkingSpotInline,)


@admin.register(ParkingSpot)
class ParkingSpotAdmin(admin.ModelAdmin):
    list_display = ("location", "number", "is_occupied")
    list_filter = ("location", "is_occupied")
    search_fields = ("location__name",)


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ("user", "spot", "start_time", "end_time", "amount", "payment_method", "payment_status", "is_active")
    list_filter = ("is_active", "payment_method", "payment_status", "start_time")
    search_fields = ("user__username", "spot__location__name")
    date_hierarchy = "start_time"


@admin.register(SavedCard)
class SavedCardAdmin(admin.ModelAdmin):
    list_display = ("user", "last_four", "expiry", "is_default", "created_at")


@admin.register(VerificationCode)
class VerificationCodeAdmin(admin.ModelAdmin):
    list_display = ("user", "purpose", "expires_at", "attempts", "created_at")
