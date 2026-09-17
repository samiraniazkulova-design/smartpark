from datetime import timedelta

from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from .models import Booking, CustomUser, ParkingLocation, ParkingSpot


class BookingFlowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.location = ParkingLocation.objects.create(
            name="Test Parking",
            address="Test address",
            latitude=42.87,
            longitude=74.59,
            total_spots=1,
        )
        cls.spot = ParkingSpot.objects.create(location=cls.location, number=1)
        cls.user = CustomUser.objects.create_user(username="driver", password="pass12345")
        cls.other_user = CustomUser.objects.create_user(username="other", password="pass12345")

    def test_homepage_is_available_to_guests(self):
        response = self.client.get(reverse("parking:index"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Test Parking")

    def test_service_worker_endpoint_returns_javascript(self):
        response = self.client.get(reverse("parking:service-worker"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/javascript")
        self.assertContains(response, "smartpark-static-v2")
        self.assertContains(response, "event.request.mode === 'navigate'")

    def test_user_can_reserve_and_release_spot(self):
        self.client.force_login(self.user)
        url = reverse("parking:toggle-booking", args=[self.spot.id])

        reserve = self.client.post(url, {"action": "reserve"})
        self.assertEqual(reserve.status_code, 200)
        self.assertTrue(self.spot.__class__.objects.get(pk=self.spot.pk).is_occupied)
        self.assertTrue(Booking.objects.get(spot=self.spot).is_active)

        release = self.client.post(url, {"action": "release"})
        self.assertEqual(release.status_code, 200)
        self.assertFalse(self.spot.__class__.objects.get(pk=self.spot.pk).is_occupied)
        self.assertFalse(Booking.objects.get(spot=self.spot).is_active)

    def test_second_user_cannot_reserve_active_spot(self):
        Booking.objects.create(
            user=self.user,
            spot=self.spot,
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=1),
        )
        self.spot.is_occupied = True
        self.spot.save(update_fields=["is_occupied"])
        self.client.force_login(self.other_user)

        response = self.client.post(
            reverse("parking:toggle-booking", args=[self.spot.id]), {"action": "reserve"}
        )
        self.assertEqual(response.status_code, 409)

    def test_occupied_flag_alone_blocks_new_booking(self):
        self.spot.is_occupied = True
        self.spot.save(update_fields=["is_occupied"])
        self.client.force_login(self.user)
        response = self.client.post(
            reverse("parking:create-booking"),
            data={"spot_id": self.spot.id, "payment_method": "mbank"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)

    @override_settings(DEBUG=True)
    def test_signup_and_phone_otp_login(self):
        signup = self.client.post(
            reverse("parking:signup"),
            data={
                "email": "new@example.com",
                "phone": "+996700000001",
                "full_name": "New Driver",
                "password": "safe-pass-123",
            },
            content_type="application/json",
        )
        self.assertEqual(signup.status_code, 201)
        user = CustomUser.objects.get(email="new@example.com")
        code = user.verification_codes.first()
        self.assertIsNotNone(code)

        from parking.models import VerificationCode
        self.assertIsInstance(code, VerificationCode)

        verify = self.client.post(
            reverse("parking:verify-otp"),
            data={"phone": "+996700000001", "code": signup.json()["dev_code"]},
            content_type="application/json",
        )
        self.assertEqual(verify.status_code, 200)
        self.assertTrue(self.client.session.get("_auth_user_id"))

    @override_settings(DEBUG=True)
    def test_signup_rejects_common_password(self):
        response = self.client.post(
            reverse("parking:signup"),
            data={
                "email": "weak@example.com",
                "phone": "+996700000009",
                "full_name": "Weak User",
                "password": "password",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(CustomUser.objects.filter(email="weak@example.com").exists())

    @override_settings(DEBUG=True)
    def test_signup_rejects_duplicate_phone(self):
        self.user.phone = "+996700000000"
        self.user.save(update_fields=["phone"])
        response = self.client.post(
            reverse("parking:signup"),
            data={
                "email": "duplicate@example.com",
                "phone": self.user.phone,
                "full_name": "Duplicate User",
                "password": "safe-pass-123",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 409)

    @override_settings(DEBUG=True)
    def test_phone_formats_are_normalized(self):
        response = self.client.post(
            reverse("parking:signup"),
            data={
                "email": "format@example.com",
                "phone": "0700 000 003",
                "full_name": "Format User",
                "password": "safe-pass-123",
            },
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(CustomUser.objects.get(email="format@example.com").phone, "+996700000003")

    def test_authenticated_user_can_read_booking_history(self):
        self.client.force_login(self.user)
        response = self.client.get(reverse("parking:booking-history"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["bookings"], [])

    def test_locations_status_is_public_and_returns_spots(self):
        response = self.client.get(reverse("parking:locations-status"))
        self.assertEqual(response.status_code, 200)
        spot_ids = {
            spot["id"]
            for location in response.json()["locations"]
            for spot in location["spots"]
        }
        self.assertIn(self.spot.id, spot_ids)

    def test_locations_status_clears_expired_booking(self):
        Booking.objects.create(
            user=self.user,
            spot=self.spot,
            start_time=timezone.now() - timedelta(hours=2),
            end_time=timezone.now() - timedelta(hours=1),
            is_active=True,
        )
        self.spot.is_occupied = True
        self.spot.save(update_fields=["is_occupied"])
        self.client.get(reverse("parking:locations-status"))
        self.assertFalse(ParkingSpot.objects.get(pk=self.spot.pk).is_occupied)
        self.assertFalse(Booking.objects.get(spot=self.spot).is_active)

    def test_missing_spot_status_returns_not_found(self):
        self.client.force_login(self.user)
        response = self.client.get(reverse("parking:spot-status", args=[999999]))
        self.assertEqual(response.status_code, 404)

    def test_spot_status_clears_expired_booking(self):
        Booking.objects.create(
            user=self.user,
            spot=self.spot,
            start_time=timezone.now() - timedelta(hours=2),
            end_time=timezone.now() - timedelta(hours=1),
            is_active=True,
        )
        self.spot.is_occupied = True
        self.spot.save(update_fields=["is_occupied"])
        self.client.force_login(self.user)
        response = self.client.get(reverse("parking:spot-status", args=[self.spot.id]))
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["is_occupied"])

    def test_user_can_update_profile(self):
        self.client.force_login(self.user)
        response = self.client.post(
            reverse("parking:update-profile"),
            data={"full_name": "Updated Driver", "email": "updated@example.com", "phone": "+996700000002"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Updated")
        self.assertEqual(self.user.phone, "+996700000002")

    def test_user_can_change_password(self):
        self.client.force_login(self.user)
        response = self.client.post(
            reverse("parking:change-password"),
            data={"current_password": "pass12345", "new_password": "new-safe-123", "confirm_password": "new-safe-123"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("new-safe-123"))

    def test_create_booking_marks_spot_occupied(self):
        self.client.force_login(self.user)
        response = self.client.post(
            reverse("parking:create-booking"),
            data={"spot_id": self.spot.id, "payment_method": "mbank"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(ParkingSpot.objects.get(pk=self.spot.pk).is_occupied)
        self.assertEqual(response.json()["amount"], 100.0)

    def test_create_booking_calculates_multi_hour_price(self):
        self.client.force_login(self.user)
        response = self.client.post(
            reverse("parking:create-booking"),
            data={"spot_id": self.spot.id, "payment_method": "mbank", "duration_hours": 3},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        booking = Booking.objects.get(spot=self.spot, is_active=True)
        self.assertEqual(booking.amount, 300)
        self.assertEqual(booking.end_time - booking.start_time, timedelta(hours=3))

    def test_user_can_cancel_own_active_booking(self):
        booking = Booking.objects.create(
            user=self.user,
            spot=self.spot,
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=1),
            amount=100,
        )
        self.spot.is_occupied = True
        self.spot.save(update_fields=["is_occupied"])
        self.client.force_login(self.user)
        response = self.client.post(reverse("parking:cancel-booking", args=[booking.id]))
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Booking.objects.get(pk=booking.pk).is_active)
        self.assertFalse(ParkingSpot.objects.get(pk=self.spot.pk).is_occupied)

    def test_other_user_cannot_cancel_booking(self):
        booking = Booking.objects.create(
            user=self.user,
            spot=self.spot,
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=1),
            amount=100,
        )
        self.spot.is_occupied = True
        self.spot.save(update_fields=["is_occupied"])
        self.client.force_login(self.other_user)
        response = self.client.post(reverse("parking:cancel-booking", args=[booking.id]))
        self.assertEqual(response.status_code, 404)
        self.assertTrue(Booking.objects.get(pk=booking.pk).is_active)

    def test_wallet_payment_is_refunded_on_cancellation(self):
        self.user.wallet_balance = 100
        self.user.save(update_fields=["wallet_balance"])
        booking = Booking.objects.create(
            user=self.user,
            spot=self.spot,
            start_time=timezone.now(),
            end_time=timezone.now() + timedelta(hours=1),
            payment_method="wallet",
            payment_status="paid",
            amount=100,
        )
        self.spot.is_occupied = True
        self.spot.save(update_fields=["is_occupied"])
        self.user.wallet_balance = 0
        self.user.save(update_fields=["wallet_balance"])
        self.client.force_login(self.user)
        response = self.client.post(reverse("parking:cancel-booking", args=[booking.id]))
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.wallet_balance, 100)

    def test_expired_booking_releases_spot_before_new_booking(self):
        Booking.objects.create(
            user=self.user,
            spot=self.spot,
            start_time=timezone.now() - timedelta(hours=2),
            end_time=timezone.now() - timedelta(hours=1),
            is_active=True,
            amount=100,
        )
        self.spot.is_occupied = True
        self.spot.save(update_fields=["is_occupied"])
        self.client.force_login(self.other_user)
        response = self.client.post(
            reverse("parking:create-booking"),
            data={"spot_id": self.spot.id, "payment_method": "mbank"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Booking.objects.filter(spot=self.spot, is_active=True).count(), 1)
