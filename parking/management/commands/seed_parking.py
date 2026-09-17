from django.core.management.base import BaseCommand

from parking.models import Booking, ParkingLocation, ParkingSpot


LOCATIONS = (
    ("Asia Mall", "Chyngyz Aitmatov Avenue 3", "42.8651", "74.5833", 20),
    ("Bishkek Park", "Kiev Street 148", "42.8756", "74.6042", 18),
    ("Dordoi Plaza", "Ibraimov Street 115", "42.8792", "74.6155", 16),
    ("Vefa Center", "Gorky Street 27/1", "42.8550", "74.6120", 14),
    ("Beta Stores", "Kiev Street 150", "42.8750", "74.6080", 12),
)


class Command(BaseCommand):
    help = "Create or update SmartPark Bishkek parking locations and spots."

    def handle(self, *args, **options):
        for legacy_name in ("Vefa",):
            legacy = ParkingLocation.objects.filter(name=legacy_name).first()
            if legacy and not Booking.objects.filter(spot__location=legacy).exists():
                legacy.delete()

        for name, address, latitude, longitude, spot_count in LOCATIONS:
            location, created = ParkingLocation.objects.update_or_create(
                name=name,
                defaults={
                    "address": address,
                    "latitude": latitude,
                    "longitude": longitude,
                    "total_spots": spot_count,
                    "price": 0 if name == "Asia Mall" else 100,
                },
            )
            for number in range(1, spot_count + 1):
                ParkingSpot.objects.get_or_create(location=location, number=number)
            action = "Created" if created else "Updated"
            self.stdout.write(f"{action}: {name} ({location.latitude}, {location.longitude})")

        self.stdout.write(self.style.SUCCESS("SmartPark locations and spots are ready."))
