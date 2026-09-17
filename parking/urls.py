from django.urls import path

from . import views

app_name = "parking"

urlpatterns = [
    path("", views.index, name="index"),
    path("api/auth/signup/", views.signup, name="signup"),
    path("api/auth/login/", views.login, name="login"),
    path("api/auth/verify/", views.verify_otp, name="verify-otp"),
    path("api/auth/logout/", views.logout, name="logout"),
    path("api/cards/", views.add_card, name="add-card"),
    path("api/bookings/", views.create_booking, name="create-booking"),
    path("api/spots/<int:spot_id>/status/", views.spot_status, name="spot-status"),
    path("api/spots/<int:spot_id>/booking/", views.toggle_booking, name="toggle-booking"),
]
