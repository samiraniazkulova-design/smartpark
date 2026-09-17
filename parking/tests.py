from datetime import timedelta

from django.test import TestCase
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
