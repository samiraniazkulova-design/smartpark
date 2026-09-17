const root = document.documentElement;
const themeToggle = document.querySelector('.theme-toggle');
const screenNodes = document.querySelectorAll('.screen');
const navButtons = document.querySelectorAll('.nav-item');
const authTabs = document.querySelectorAll('.tab');
const filterChips = document.querySelectorAll('.filter-chip');
const locationCards = document.querySelectorAll('.location-card');
const getStartedBtn = document.querySelector('.get-started');
const saveCardBtn = document.querySelector('.save-card-btn');
const cardMessage = document.getElementById('card-message');
const continueBtn = document.querySelector('.pay-btn');
const locationInput = document.getElementById('location-search');
const mapModeButton = document.getElementById('map-mode');
const authSubmit = document.querySelector('.auth-submit');
const otpSubmit = document.querySelector('.otp-submit');
const authMessage = document.getElementById('auth-message');
const bookingMessage = document.getElementById('booking-message');
const signupFields = document.querySelectorAll('.signup-only');
const otpBoxes = document.getElementById('otp-boxes');
const paymentMethods = document.querySelectorAll('.payment-method');
const addCardButtons = document.querySelectorAll('.mini-btn');
let authMode = 'signin';
let pendingAuthEmail = '';
let selectedSpotId = null;
let selectedPaymentMethod = 'mbank';
let selectedLocationCard = null;
let streetLayer;
let satelliteLayer;
let satelliteMode = false;

function csrfToken() {
    return document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';
}

async function postJson(url, payload) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken(),
        },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({ error: 'Сервер вернул некорректный ответ.' }));
    if (!response.ok) throw new Error(body.error || 'Операция не выполнена.');
    return body;
}

if (localStorage.getItem('smartpark-theme') === 'light') {
    root.dataset.theme = 'light';
    if (themeToggle) themeToggle.innerHTML = '<span class="theme-icon">☾</span>';
}

themeToggle?.addEventListener('click', () => {
    const isLight = root.dataset.theme === 'light';
    root.dataset.theme = isLight ? 'dark' : 'light';
    localStorage.setItem('smartpark-theme', isLight ? 'dark' : 'light');
    themeToggle.innerHTML = isLight ? '<span class="theme-icon">☀</span>' : '<span class="theme-icon">☾</span>';
});

function showScreen(name) {
    screenNodes.forEach((screen) => {
        screen.classList.toggle('active', screen.dataset.screen === name);
    });

    navButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.target === name);
    });
}

navButtons.forEach((button) => {
    button.addEventListener('click', () => showScreen(button.dataset.target));
});

getStartedBtn?.addEventListener('click', () => showScreen('auth'));
saveCardBtn?.addEventListener('click', async () => {
    const cardNumber = document.getElementById('card-number')?.value || '';
    const holderName = document.getElementById('card-holder')?.value.trim() || '';
    const expiry = document.getElementById('card-expiry')?.value.trim() || '';
    try {
        const result = await postJson('/api/cards/', { card_number: cardNumber, holder_name: holderName, expiry });
        if (cardMessage) cardMessage.textContent = `Карта **** ${result.last_four} сохранена.`;
        showScreen('map');
    } catch (error) {
        if (cardMessage) cardMessage.textContent = error.message;
    }
});

authTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
        authTabs.forEach((item) => item.classList.toggle('active', item === tab));
        authMode = tab.dataset.auth;
        signupFields.forEach((field) => { field.hidden = authMode !== 'signup'; });
        if (authMessage) authMessage.textContent = '';
    });
});

authSubmit?.addEventListener('click', async () => {
    const email = document.getElementById('auth-email')?.value.trim().toLowerCase();
    const password = document.getElementById('auth-password')?.value || '';
    const payload = { email, password };
    if (authMode === 'signup') {
        payload.full_name = document.getElementById('auth-name')?.value.trim();
        payload.phone = document.getElementById('auth-phone')?.value.trim();
    }
    try {
        const endpoint = authMode === 'signup' ? '/api/auth/signup/' : '/api/auth/login/';
        const result = await postJson(endpoint, payload);
        pendingAuthEmail = email;
        if (result.requires_otp) {
            otpBoxes.hidden = false;
            otpSubmit.hidden = false;
            authSubmit.hidden = true;
            if (authMessage) authMessage.textContent = result.dev_code ? `Demo OTP: ${result.dev_code}` : result.message;
        } else {
            showScreen('card');
        }
    } catch (error) {
        if (authMessage) authMessage.textContent = error.message;
    }
});

otpSubmit?.addEventListener('click', async () => {
    const code = [...otpBoxes.querySelectorAll('input')].map((input) => input.value).join('');
    try {
        await postJson('/api/auth/verify/', { email: pendingAuthEmail, code });
        showScreen('card');
    } catch (error) {
        if (authMessage) authMessage.textContent = error.message;
    }
});

document.querySelectorAll('.otp-boxes input').forEach((input, index, inputs) => {
    input.addEventListener('input', () => inputs[index + 1]?.focus());
});

filterChips.forEach((chip) => {
    chip.addEventListener('click', () => {
        filterChips.forEach((item) => item.classList.toggle('active', item === chip));
    });
});

const locationName = document.getElementById('selected-location-name');
const locationAddress = document.getElementById('selected-location-address');
const baseRateLabel = document.getElementById('base-rate');
const tripTotalLabel = document.getElementById('trip-total');

function updateBookingSummary(card) {
    if (!locationName || !locationAddress) return;
    locationName.textContent = card.dataset.name || 'Asia Mall';
    locationAddress.textContent = card.dataset.address || 'Chui Avenue 123';

    const price = Number(card.dataset.price || 0);
    const basePrice = price === 0 ? '0 som' : `${price} som`;
    const total = price === 0 ? '0 som' : `${price} som`;

    if (baseRateLabel) baseRateLabel.textContent = basePrice;
    if (tripTotalLabel) tripTotalLabel.textContent = total;
}

locationCards.forEach((card) => {
    card.addEventListener('click', () => {
        locationCards.forEach((item) => item.classList.toggle('active', item === card));
           selectedLocationCard = card;
        selectedSpotId = card.dataset.spotId || null;
        updateBookingSummary(card);
        showScreen('booking');
    });
});

paymentMethods.forEach((method) => {
    method.addEventListener('click', () => {
        paymentMethods.forEach((item) => item.classList.toggle('active', item === method));
        selectedPaymentMethod = method.dataset.payment;
    });
});

addCardButtons.forEach((button) => {
    button.addEventListener('click', () => showScreen('card'));
});

continueBtn?.addEventListener('click', async () => {
    if (!selectedSpotId) {
        if (bookingMessage) bookingMessage.textContent = 'Для этой зоны пока нет свободных мест в базе.';
        return;
    }
    try {
        const result = await postJson('/api/bookings/', {
            spot_id: selectedSpotId,
            payment_method: selectedPaymentMethod,
        });
        if (bookingMessage) bookingMessage.textContent = `Бронь #${result.booking_id} подтверждена.`;
           if (selectedLocationCard) {
               selectedLocationCard.dataset.free = String(result.free_spots);
               const freeLabel = selectedLocationCard.querySelector('.meta-row strong');
               if (freeLabel) freeLabel.textContent = result.free_spots;
           }
        continueBtn.disabled = true;
    } catch (error) {
        if (bookingMessage) bookingMessage.textContent = error.message;
    }
});

const mapData = JSON.parse(document.getElementById('locations-data')?.textContent || '[]');
let map;
let activeMarker;

function renderMapWithData(data) {
    if (!document.getElementById('map') || !window.L) return;
    map = L.map('map', { zoomControl: false, scrollWheelZoom: false }).setView([42.8746, 74.5698], 12);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
    satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: '&copy; Esri, Maxar, Earthstar Geographics'
    });

    const pinIcon = L.divIcon({
        className: 'custom-pin',
        html: '<span class="marker-pin"></span>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });

    data.forEach((location) => {
        const marker = L.marker([location.latitude, location.longitude], { icon: pinIcon }).addTo(map);
        marker.bindPopup(`
            <div class="map-popup">
                <h4>${location.name}</h4>
                <p>${location.address}</p>
                <p><strong>${location.free_spots}</strong> free spots</p>
            </div>
        `);
        marker.on('click', () => {
            const card = document.querySelector(`.location-card[data-location-id="${location.id}"]`);
            if (card) {
                locationCards.forEach((item) => item.classList.toggle('active', item === card));
                   selectedLocationCard = card;
                selectedSpotId = card.dataset.spotId || location.first_free_spot_id || null;
                updateBookingSummary(card);
                showScreen('booking');
            }
        });
    });
}

mapModeButton?.addEventListener('click', () => {
    if (!map || !streetLayer || !satelliteLayer) return;
    satelliteMode = !satelliteMode;
    map.removeLayer(satelliteMode ? streetLayer : satelliteLayer);
    map.addLayer(satelliteMode ? satelliteLayer : streetLayer);
    mapModeButton.textContent = satelliteMode ? 'Map' : 'Satellite';
});

if (document.getElementById('map')) {
    renderMapWithData(mapData.length ? mapData : [
        {
            id: 1,
            name: 'Asia Mall',
            address: 'Chui Avenue 123',
            latitude: 42.8746,
            longitude: 74.5698,
            free_spots: 18,
            price: 0,
        },
        {
            id: 2,
            name: 'Bishkek Park',
            address: 'Toktogul Street 21',
            latitude: 42.8864,
            longitude: 74.6122,
            free_spots: 12,
            price: 100,
        }
    ]);
}

if (locationInput) {
    locationInput.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter') return;
        const q = locationInput.value.trim();
        if (!q || !window.L || !map) return;

        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}`);
            const results = await response.json();
            if (!results || !results.length) return;

            const place = results[0];
            const lat = Number(place.lat);
            const lon = Number(place.lon);
            map.setView([lat, lon], 15);

            if (activeMarker) map.removeLayer(activeMarker);
            activeMarker = L.marker([lat, lon]).addTo(map);
            activeMarker.bindPopup(`<div class="map-popup"><h4>${place.display_name}</h4><p>Search result</p></div>`).openPopup();
        } catch (error) {
            console.error('Geocoding error:', error);
        }
    });
}
