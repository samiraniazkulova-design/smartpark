const root = document.documentElement;
const themeToggle = document.querySelector('.theme-toggle');
const soundToggle = document.getElementById('sound-toggle');
const screenNodes = document.querySelectorAll('.screen');
const navButtons = document.querySelectorAll('.nav-item');
const authTabs = document.querySelectorAll('.tab');
const filterChips = document.querySelectorAll('.filter-chip');
const locationCards = document.querySelectorAll('.location-card');
const spotButtons = document.querySelectorAll('.spot-btn:not([disabled])');
const getStartedBtn = document.querySelector('.get-started');
const saveCardBtn = document.querySelector('.save-card-btn');
const cardMessage = document.getElementById('card-message');
const continueBtn = document.querySelector('.pay-btn');
const locationInput = document.getElementById('location-search');
const searchMessage = document.getElementById('search-message');
const mapModeButton = document.getElementById('map-mode');
const authSubmit = document.querySelector('.auth-submit');
const otpSubmit = document.querySelector('.otp-submit');
const authMessage = document.getElementById('auth-message');
const bookingMessage = document.getElementById('booking-message');
const bookingStatus = document.getElementById('booking-status');
const signupFields = document.querySelectorAll('.signup-only');
const otpBoxes = document.getElementById('otp-boxes');
const paymentMethods = document.querySelectorAll('.payment-method');
const paymentHint = document.getElementById('payment-hint');
const addCardButtons = document.querySelectorAll('.mini-btn');
const languageSelect = document.getElementById('language-select');
const logoutButtons = document.querySelectorAll('.logout-btn');
const profileLogin = document.querySelector('.profile-login');
const historyRefresh = document.querySelector('.history-refresh');
const cancelBookingButtons = document.querySelectorAll('.cancel-booking');
const saveProfileButton = document.querySelector('.save-profile');
const profileMessage = document.getElementById('profile-message');
const changePasswordButton = document.querySelector('.change-password');
const passwordMessage = document.getElementById('password-message');
const durationSelect = document.getElementById('duration-select');
let authMode = 'signin';
let pendingAuthEmail = '';
let selectedSpotId = null;
let selectedPaymentMethod = 'mbank';
let selectedLocationCard = null;
let selectedDuration = 1;
let bookingSubmitting = false;
let audioContext;
let soundEnabled = localStorage.getItem('smartpark-sound') !== 'off';

function playUiSound(type = 'click') {
    if (!soundEnabled) return;
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    const frequency = type === 'success' ? 660 : type === 'error' ? 180 : 420;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.12, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(type === 'success' ? 0.08 : 0.045, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.13);
}

function updateSoundButton() {
    if (!soundToggle) return;
    soundToggle.setAttribute('aria-pressed', String(soundEnabled));
    soundToggle.innerHTML = soundEnabled ? '<span class="sound-icon">♪</span>' : '<span class="sound-icon">×</span>';
}

updateSoundButton();
let streetLayer;
let satelliteLayer;
let satelliteMode = false;
const locationMarkers = new Map();

const translations = {
    ky: {
        premiumParking: 'Премиум парковка', heroText: 'Коопсуз орунду алдын ала брондоп, убактыңызды үнөмдөңүз.',
        getStarted: 'Баштоо', secureAccess: 'Коопсуз кирүү', welcomeBack: 'Кайра кош келиңиз', signIn: 'Кирүү', signUp: 'Катталуу',
        fullName: 'Толук аты-жөнү', emailOrPhone: 'Email же телефон', phoneNumber: 'Телефон номери', password: 'Сырсөз',
        continue: 'Улантуу', verifyOtp: 'OTP текшерүү', wallet: 'Капчык', addCard: 'Карта кошуу', cardholderName: 'Карта ээси',
        cardNumber: 'Карта номери', expiry: 'Мөөнөтү', saveCard: 'Картаны сактоо', explore: 'Издөө', parkingSpots: 'Парковка орундар',
        satellite: 'Спутник', nearby: 'Жакын', open: 'Ачык', covered: 'Жабык', reservation: 'Бронь', booking: 'Брондоо',
        parkingGarage: 'Парковка', parkingSlot: 'Орун', duration: 'Убакыт', address: 'Дарек', payment: 'Төлөм',
        baseRate: 'Негизги тариф', serviceFee: 'Кызмат акысы', tripTotal: 'Жалпы сумма', confirmPayment: 'Төлөмдү ырастоо',
        home: 'Башкы бет', auth: 'Кирүү', card: 'Карта', map: 'Карта', book: 'Бронь', profile: 'Профиль', account: 'Аккаунт',
        history: 'Брондор тарыхы', noBookings: 'Азырынча брондор жок', logout: 'Чыгуу', loginToProfile: 'Профилди көрүү үчүн кириңиз',
        walletBalance: 'Капчыктагы баланс', refresh: 'Жаңыртуу', cancel: 'Жокко чыгаруу', saveProfile: 'Профилди сактоо', changePassword: 'Сырсөздү өзгөртүү', currentPassword: 'Учурдагы сырсөз', newPassword: 'Жаңы сырсөз', confirmPassword: 'Жаңы сырсөздү кайталаңыз', updatePassword: 'Сырсөздү жаңыртуу', openStatus: 'Ачык', reservedStatus: 'Брондолду', mbankHint: 'MBank QR аркылуу демо-төлөм', optimaHint: 'Optima QR аркылуу демо-төлөм', walletHint: 'Капчыктан төлөө', cardHint: 'Сакталган карта менен төлөө', searching: 'Изделүүдө...', notFound: 'Дарек табылган жок', searchError: 'Издөөдө ката кетти'
    },
    ru: {
        premiumParking: 'Премиум парковка', heroText: 'Забронируйте безопасное место и экономьте время в городе.',
        getStarted: 'Начать', secureAccess: 'Безопасный вход', welcomeBack: 'С возвращением', signIn: 'Войти', signUp: 'Регистрация',
        fullName: 'Полное имя', emailOrPhone: 'Email или телефон', phoneNumber: 'Номер телефона', password: 'Пароль',
        continue: 'Продолжить', verifyOtp: 'Проверить OTP', wallet: 'Кошелек', addCard: 'Добавить карту', cardholderName: 'Имя владельца',
        cardNumber: 'Номер карты', expiry: 'Срок действия', saveCard: 'Сохранить карту', explore: 'Поиск', parkingSpots: 'Парковочные места',
        satellite: 'Спутник', nearby: 'Рядом', open: 'Открытые', covered: 'Крытые', reservation: 'Резервация', booking: 'Бронирование',
        parkingGarage: 'Парковка', parkingSlot: 'Место', duration: 'Время', address: 'Адрес', payment: 'Оплата',
        baseRate: 'Базовый тариф', serviceFee: 'Сервисный сбор', tripTotal: 'Итого', confirmPayment: 'Подтвердить оплату',
        home: 'Главная', auth: 'Вход', card: 'Карта', map: 'Карта', book: 'Бронь', profile: 'Профиль', account: 'Аккаунт',
        history: 'История бронирований', noBookings: 'Бронирований пока нет', logout: 'Выйти', loginToProfile: 'Войдите, чтобы открыть профиль',
        walletBalance: 'Баланс кошелька', refresh: 'Обновить', cancel: 'Отменить', saveProfile: 'Сохранить профиль', changePassword: 'Изменить пароль', currentPassword: 'Текущий пароль', newPassword: 'Новый пароль', confirmPassword: 'Повторите новый пароль', updatePassword: 'Обновить пароль', openStatus: 'Открыто', reservedStatus: 'Забронировано', mbankHint: 'Демо-оплата через MBank QR', optimaHint: 'Демо-оплата через Optima QR', walletHint: 'Оплата из кошелька', cardHint: 'Оплата сохраненной картой', searching: 'Ищем...', notFound: 'Место не найдено', searchError: 'Ошибка поиска'
    },
    en: {
        premiumParking: 'Premium parking', heroText: 'Reserve a safe place, save time, and drive into the city with confidence.',
        getStarted: 'Get Started', secureAccess: 'Secure access', welcomeBack: 'Welcome back', signIn: 'Sign In', signUp: 'Sign Up',
        fullName: 'Full name', emailOrPhone: 'Email or phone', phoneNumber: 'Phone Number', password: 'Password',
        continue: 'Continue', verifyOtp: 'Verify OTP', wallet: 'Wallet', addCard: 'Add Card', cardholderName: 'Cardholder name',
        cardNumber: 'Card number', expiry: 'Expiry', saveCard: 'Save Card', explore: 'Explore', parkingSpots: 'Parking spots',
        satellite: 'Satellite', nearby: 'Nearby', open: 'Open', covered: 'Covered', reservation: 'Reservation', booking: 'Booking',
        parkingGarage: 'Parking Garage', parkingSlot: 'Parking slot', duration: 'Duration', address: 'Address', payment: 'Payment',
        baseRate: 'Base rate', serviceFee: 'Service fee', tripTotal: 'Trip total', confirmPayment: 'Confirm payment',
        home: 'Home', auth: 'Auth', card: 'Card', map: 'Map', book: 'Book', profile: 'Profile', account: 'Account',
        history: 'Booking history', noBookings: 'No bookings yet', logout: 'Log out', loginToProfile: 'Sign in to open your profile',
        walletBalance: 'Wallet balance', refresh: 'Refresh', cancel: 'Cancel', saveProfile: 'Save profile', changePassword: 'Change password', currentPassword: 'Current password', newPassword: 'New password', confirmPassword: 'Repeat new password', updatePassword: 'Update password', openStatus: 'Open', reservedStatus: 'Reserved', mbankHint: 'Demo payment via MBank QR', optimaHint: 'Demo payment via Optima QR', walletHint: 'Pay from wallet', cardHint: 'Pay with saved card', searching: 'Searching...', notFound: 'Location not found', searchError: 'Search error'
    }
};

function applyLanguage(language) {
    const dictionary = translations[language] || translations.en;
    document.documentElement.lang = language;
    document.querySelectorAll('[data-i18n]').forEach((element) => {
        const value = dictionary[element.dataset.i18n];
        if (value) element.textContent = value;
    });
    const search = document.getElementById('location-search');
    if (search) search.placeholder = language === 'ky' ? 'Дарек издеңиз' : language === 'ru' ? 'Поиск места' : 'Search Location';
    if (mapModeButton) mapModeButton.textContent = satelliteMode ? dictionary.map : dictionary.satellite;
    if (paymentHint) paymentHint.textContent = dictionary[`${selectedPaymentMethod}Hint`] || dictionary.mbankHint;
    if (bookingStatus && bookingStatus.dataset.status === 'reserved') bookingStatus.textContent = dictionary.reservedStatus;
    if (searchMessage && !searchMessage.dataset.active) searchMessage.textContent = '';
    localStorage.setItem('smartpark-language', language);
}

const savedLanguage = localStorage.getItem('smartpark-language') || 'ru';
if (languageSelect) {
    languageSelect.value = savedLanguage;
    languageSelect.addEventListener('change', () => applyLanguage(languageSelect.value));
}
applyLanguage(savedLanguage);

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
document.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => playUiSound('click'));
});

soundToggle?.addEventListener('click', (event) => {
    event.stopPropagation();
    soundEnabled = !soundEnabled;
    localStorage.setItem('smartpark-sound', soundEnabled ? 'on' : 'off');
    updateSoundButton();
    if (soundEnabled) playUiSound('success');
});
profileLogin?.addEventListener('click', () => showScreen('auth'));

logoutButtons.forEach((button) => {
    button.addEventListener('click', async () => {
        await postJson('/api/auth/logout/', {});
        window.location.reload();
    });
});

historyRefresh?.addEventListener('click', async () => {
    try {
        const response = await fetch('/api/bookings/history/', { credentials: 'same-origin' });
        if (response.ok) window.location.reload();
    } catch (error) {
        console.error('History refresh error:', error);
    }
});

cancelBookingButtons.forEach((button) => {
    button.addEventListener('click', async () => {
        button.disabled = true;
        try {
            await postJson(`/api/bookings/${button.dataset.bookingId}/cancel/`, {});
            const historyItem = button.closest('.history-item');
            const spotId = historyItem?.dataset.spotId;
            const releasedSpot = document.querySelector(`.spot-btn[data-spot-id="${spotId}"]`);
            if (releasedSpot) {
                releasedSpot.disabled = false;
                releasedSpot.classList.remove('occupied', 'selected');
                releasedSpot.classList.add('released');
            }
            historyItem?.remove();
        } catch (error) {
            button.disabled = false;
            console.error('Cancel booking error:', error);
        }
    });
});

saveProfileButton?.addEventListener('click', async () => {
    try {
        const result = await postJson('/api/profile/', {
            full_name: document.getElementById('profile-name')?.value.trim(),
            email: document.getElementById('profile-email')?.value.trim(),
            phone: document.getElementById('profile-phone')?.value.trim(),
        });
        document.querySelector('.profile-card h4').textContent = result.full_name;
        document.querySelector('.profile-email').textContent = result.email;
        document.querySelector('.profile-phone').textContent = result.phone;
        if (profileMessage) profileMessage.textContent = 'Профиль сохранен.';
    } catch (error) {
        if (profileMessage) profileMessage.textContent = error.message;
    }
});

changePasswordButton?.addEventListener('click', async () => {
    try {
        await postJson('/api/profile/password/', {
            current_password: document.getElementById('current-password')?.value || '',
            new_password: document.getElementById('new-password')?.value || '',
            confirm_password: document.getElementById('confirm-password')?.value || '',
        });
        if (passwordMessage) passwordMessage.textContent = 'Пароль обновлен.';
        document.querySelectorAll('#current-password, #new-password, #confirm-password').forEach((input) => { input.value = ''; });
    } catch (error) {
        if (passwordMessage) passwordMessage.textContent = error.message;
    }
});

window.setTimeout(() => {
    const splashScreen = document.querySelector('[data-screen="splash"]');
    if (splashScreen?.classList.contains('active')) {
        splashScreen.classList.add('ready');
    }
}, 1900);
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
        const identifierKey = pendingAuthEmail.includes('@') ? 'email' : 'phone';
        await postJson('/api/auth/verify/', { [identifierKey]: pendingAuthEmail, code });
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
    const totalPrice = price * selectedDuration;
    const total = totalPrice === 0 ? '0 som' : `${totalPrice} som`;

    if (baseRateLabel) baseRateLabel.textContent = basePrice;
    if (tripTotalLabel) tripTotalLabel.textContent = total;
}

durationSelect?.addEventListener('change', () => {
    selectedDuration = Number(durationSelect.value);
    if (selectedLocationCard) updateBookingSummary(selectedLocationCard);
});

async function refreshLocationStatus() {
    try {
        const response = await fetch('/api/locations/status/', { credentials: 'same-origin' });
        if (!response.ok) return;
        const payload = await response.json();
        payload.locations.forEach((location) => {
            const card = document.querySelector(`.location-card[data-location-id="${location.id}"]`);
            if (!card) return;
            card.dataset.free = String(location.free_spots);
            const freeLabel = card.querySelector('.meta-row strong');
            if (freeLabel) freeLabel.textContent = location.free_spots;
            const marker = locationMarkers.get(String(location.id));
            if (marker) {
                const popup = marker.getPopup();
                if (popup) {
                    const popupNode = document.createElement('div');
                    popupNode.innerHTML = popup.getContent();
                    const freeText = popupNode.querySelector('[data-popup-free]');
                    if (freeText) freeText.textContent = `${location.free_spots} free spots`;
                    marker.setPopupContent(popupNode.innerHTML);
                }
            }
            location.spots.forEach((spot) => {
                const button = card.querySelector(`.spot-btn[data-spot-id="${spot.id}"]`);
                if (!button || button.classList.contains('selected')) return;
                button.disabled = spot.is_occupied;
                button.classList.toggle('occupied', spot.is_occupied);
                if (!spot.is_occupied) button.classList.remove('released');
            });
        });
    } catch (error) {
        console.error('Location status refresh error:', error);
    }
}

window.setInterval(refreshLocationStatus, 15000);

locationCards.forEach((card) => {
    card.addEventListener('click', () => {
        locationCards.forEach((item) => item.classList.toggle('active', item === card));
           selectedLocationCard = card;
        selectedSpotId = card.dataset.spotId || null;
        updateBookingSummary(card);
        showScreen('booking');
    });
});

spotButtons.forEach((spotButton) => {
    spotButton.addEventListener('click', (event) => {
        event.stopPropagation();
        const card = spotButton.closest('.location-card');
        locationCards.forEach((item) => item.classList.toggle('active', item === card));
        selectedLocationCard = card;
        selectedSpotId = spotButton.dataset.spotId;
        card.querySelectorAll('.spot-btn').forEach((item) => item.classList.toggle('selected', item === spotButton));
        updateBookingSummary(card);
        const selectedSlot = document.querySelector('.breakdown-item strong');
        if (selectedSlot) selectedSlot.textContent = `A-${spotButton.textContent.padStart(2, '0')}`;
        showScreen('booking');
    });
});

paymentMethods.forEach((method) => {
    method.addEventListener('click', () => {
        paymentMethods.forEach((item) => item.classList.toggle('active', item === method));
        selectedPaymentMethod = method.dataset.payment;
        const dictionary = translations[languageSelect?.value || 'ru'] || translations.ru;
        if (paymentHint) paymentHint.textContent = dictionary[`${selectedPaymentMethod}Hint`] || dictionary.mbankHint;
    });
});

addCardButtons.forEach((button) => {
    button.addEventListener('click', () => showScreen('card'));
});

continueBtn?.addEventListener('click', async () => {
    if (bookingSubmitting) return;
    if (!selectedSpotId) {
        if (bookingMessage) bookingMessage.textContent = 'Для этой зоны пока нет свободных мест в базе.';
        return;
    }
    bookingSubmitting = true;
    continueBtn.disabled = true;
    const originalLabel = continueBtn.textContent;
    continueBtn.textContent = 'Обработка...';
    try {
        const result = await postJson('/api/bookings/', {
            spot_id: selectedSpotId,
            payment_method: selectedPaymentMethod,
            duration_hours: selectedDuration,
        });
        if (bookingMessage) bookingMessage.textContent = `Бронь #${result.booking_id} подтверждена.`;
        playUiSound('success');
        if (bookingStatus) {
            bookingStatus.dataset.status = 'reserved';
            const dictionary = translations[languageSelect?.value || 'ru'] || translations.ru;
            bookingStatus.textContent = dictionary.reservedStatus;
        }
           if (selectedLocationCard) {
               selectedLocationCard.dataset.free = String(result.free_spots);
               const freeLabel = selectedLocationCard.querySelector('.meta-row strong');
               if (freeLabel) freeLabel.textContent = result.free_spots;
           }
        const bookedSpot = document.querySelector(`.spot-btn[data-spot-id="${selectedSpotId}"]`);
        if (bookedSpot) {
            bookedSpot.disabled = true;
            bookedSpot.classList.remove('selected', 'released');
            bookedSpot.classList.add('occupied');
        }
        continueBtn.textContent = originalLabel;
    } catch (error) {
        playUiSound('error');
        if (bookingMessage) bookingMessage.textContent = error.message;
        bookingSubmitting = false;
        continueBtn.disabled = false;
        continueBtn.textContent = originalLabel;
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
                <p><strong data-popup-free>${location.free_spots} free spots</strong></p>
            </div>
        `);
        locationMarkers.set(String(location.id), marker);
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
    const dictionary = translations[languageSelect?.value || 'en'] || translations.en;
    mapModeButton.textContent = satelliteMode ? dictionary.map : dictionary.satellite;
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
        const dictionary = translations[languageSelect?.value || 'ru'] || translations.ru;
        if (searchMessage) {
            searchMessage.textContent = dictionary.searching;
            searchMessage.dataset.active = 'true';
        }

        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}`);
            const results = await response.json();
            if (!results || !results.length) {
                if (searchMessage) searchMessage.textContent = dictionary.notFound;
                return;
            }

            const place = results[0];
            const lat = Number(place.lat);
            const lon = Number(place.lon);
            map.setView([lat, lon], 15);

            if (activeMarker) map.removeLayer(activeMarker);
            activeMarker = L.marker([lat, lon]).addTo(map);
            activeMarker.bindPopup(`<div class="map-popup"><h4>${place.display_name}</h4><p>Search result</p></div>`).openPopup();
            if (searchMessage) searchMessage.textContent = place.display_name;
        } catch (error) {
            console.error('Geocoding error:', error);
            if (searchMessage) searchMessage.textContent = dictionary.searchError;
        }
    });
}
