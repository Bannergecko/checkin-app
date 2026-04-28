// Storage keys
const STORAGE_KEYS = {
    CHECKINS: 'lathrop_checkins',
    EVENTS: 'lathrop_events',
    PEOPLE: 'lathrop_people'
};

// Login credentials
const ADMIN_CREDENTIALS = {
    username: 'glcc',
    password: 'Lathrop#1'
};

let isAdminLoggedIn = false;

// Default events
const DEFAULT_EVENTS = [
    'Business After Hours',
    'Ribbon Cutting',
    'Morning Mixer',
    'Annual Banquet',
    'Board Meeting',
    'Networking Breakfast',
    'Chamber 101',
    'Other'
];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeEvents();
    loadEventSelect();
    loadExportEventSelect();
    updateStats();
    setupNameSearch();
    setupClearPerson();
});

// Form submission
document.getElementById('checkinForm').addEventListener('submit', (e) => {
    e.preventDefault();

    const emailField = document.getElementById('email');
    const phoneField = document.getElementById('phone');
    const email = (emailField.dataset.realEmail || emailField.value).trim();
    const phone = (phoneField.dataset.realPhone || stripPhoneFormatting(phoneField.value));

    // Validate email only if not using stored user
    if (!emailField.dataset.isStoredUser) {
        const validation = isValidEmail(email);
        if (!validation.valid) {
            document.getElementById('emailError').textContent = validation.error;
            document.getElementById('emailError').classList.remove('hidden');
            return;
        }
    }

    // Validate phone only if not using stored user
    if (!phoneField.dataset.isStoredUser) {
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length !== 10) {
            alert('Please enter a valid 10-digit phone number');
            return;
        }
    }

    document.getElementById('emailError').classList.add('hidden');

    const checkin = {
        id: Date.now(),
        name: document.getElementById('name').value.trim(),
        phone: phone,
        email: email,
        event: document.getElementById('event').value,
        timestamp: new Date().toISOString()
    };

    saveCheckin(checkin);
    saveOrUpdatePerson(checkin);
    showSuccess();
    resetForm();
    updateStats();
});

function resetForm() {
    const emailField = document.getElementById('email');
    const phoneField = document.getElementById('phone');
    document.getElementById('checkinForm').reset();
    emailField.dataset.realEmail = '';
    delete emailField.dataset.isStoredUser;
    phoneField.dataset.realPhone = '';
    delete phoneField.dataset.isStoredUser;
    document.getElementById('clearPerson').classList.add('hidden');
    document.getElementById('emailError').classList.add('hidden');
    // Re-auto-select if only one event
    autoSelectSingleEvent();
}

function initializeEvents() {
    let events = getEvents();
    if (events.length === 0) {
        localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(DEFAULT_EVENTS));
    }
}

function getEvents() {
    const data = localStorage.getItem(STORAGE_KEYS.EVENTS);
    return data ? JSON.parse(data) : [];
}

function saveEvent(eventName) {
    const events = getEvents();
    if (!events.includes(eventName)) {
        events.push(eventName);
        localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
        return true;
    }
    return false;
}

function deleteEvent(eventName) {
    let events = getEvents();
    events = events.filter(e => e !== eventName);
    localStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
    loadEventSelect();
    loadExportEventSelect();
    loadEventList();
}

function autoSelectSingleEvent() {
    const events = getEvents();
    const select = document.getElementById('event');
    if (events.length === 1) {
        select.value = events[0];
    }
}

function loadEventSelect() {
    const select = document.getElementById('event');
    const currentValue = select.value;
    const events = getEvents();

    select.innerHTML = '<option value="">Select an event...</option>';
    events.forEach(event => {
        const option = document.createElement('option');
        option.value = event;
        option.textContent = event;
        select.appendChild(option);
    });

    if (events.includes(currentValue)) {
        select.value = currentValue;
    } else {
        autoSelectSingleEvent();
    }
}

function loadExportEventSelect() {
    const select = document.getElementById('exportEvent');
    const events = getEvents();

    select.innerHTML = '<option value="">All Events</option>';
    events.forEach(event => {
        const option = document.createElement('option');
        option.value = event;
        option.textContent = event;
        select.appendChild(option);
    });
}

function addEvent() {
    const input = document.getElementById('newEvent');
    const eventName = input.value.trim();

    if (eventName && saveEvent(eventName)) {
        input.value = '';
        loadEventSelect();
        loadExportEventSelect();
        loadEventList();
    }
}

function loadEventList() {
    const list = document.getElementById('eventList');
    const events = getEvents();

    if (events.length === 0) {
        list.innerHTML = '<p class="text-gray-400">No events configured</p>';
        return;
    }

    list.innerHTML = events.map(event =>
        `<div class="flex justify-between items-center py-1">
            <span>${event}</span>
            <button onclick="deleteEvent('${event}')" class="text-red-500 hover:text-red-700 text-xs">Remove</button>
        </div>`
    ).join('');
}

function getCheckins() {
    const data = localStorage.getItem(STORAGE_KEYS.CHECKINS);
    return data ? JSON.parse(data) : [];
}

function saveCheckin(checkin) {
    const checkins = getCheckins();
    checkins.push(checkin);
    localStorage.setItem(STORAGE_KEYS.CHECKINS, JSON.stringify(checkins));
}

// People database functions
function getPeople() {
    const data = localStorage.getItem(STORAGE_KEYS.PEOPLE);
    return data ? JSON.parse(data) : [];
}

function saveOrUpdatePerson(checkin) {
    const people = getPeople();
    const existingIndex = people.findIndex(p => p.email === checkin.email);

    if (existingIndex >= 0) {
        // Update existing person
        people[existingIndex] = {
            ...people[existingIndex],
            name: checkin.name,
            phone: checkin.phone,
            lastSeen: checkin.timestamp,
            checkinCount: (people[existingIndex].checkinCount || 1) + 1
        };
    } else {
        // Add new person
        people.push({
            email: checkin.email,
            name: checkin.name,
            phone: checkin.phone,
            firstSeen: checkin.timestamp,
            lastSeen: checkin.timestamp,
            checkinCount: 1
        });
    }

    localStorage.setItem(STORAGE_KEYS.PEOPLE, JSON.stringify(people));
}

// Better email validation
function isValidEmail(email) {
    if (!email || email.length === 0) {
        return { valid: false, error: 'Email is required' };
    }

    // Check for basic format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { valid: false, error: 'Please enter a valid email address (e.g., name@example.com)' };
    }

    // Check for obfuscation patterns (should not have ... in manually entered emails)
    if (email.includes('...')) {
        return { valid: false, error: 'Please enter a complete email address' };
    }

    // Check for multiple @ signs
    if ((email.match(/@/g) || []).length > 1) {
        return { valid: false, error: 'Email can only contain one @ symbol' };
    }

    // Check that domain part has valid structure
    const [, domain] = email.split('@');
    if (!domain || !domain.includes('.') || domain.split('.')[1]?.length < 2) {
        return { valid: false, error: 'Please enter a valid email domain' };
    }

    return { valid: true };
}

function setupNameSearch() {
    const nameInput = document.getElementById('name');
    const suggestionsBox = document.getElementById('nameSuggestions');

    nameInput.addEventListener('input', () => {
        const query = nameInput.value.trim().toLowerCase();

        if (query.length < 2) {
            suggestionsBox.classList.add('hidden');
            return;
        }

        const people = getPeople();
        const matches = people.filter(p =>
            p.name.toLowerCase().includes(query) ||
            p.email.toLowerCase().includes(query)
        ).slice(0, 5);

        if (matches.length === 0) {
            suggestionsBox.classList.add('hidden');
            return;
        }

        suggestionsBox.innerHTML = matches.map(p => `
            <div class="suggestion-item px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b border-gray-100 last:border-0"
                 data-name="${p.name}" data-phone="${p.phone}" data-email="${p.email}" data-obfuscated="${obfuscateEmail(p.email)}">
                <div class="font-medium text-gray-800">${p.name}</div>
                <div class="text-sm text-gray-500">${obfuscateEmail(p.email)}</div>
            </div>
        `).join('');

        suggestionsBox.classList.remove('hidden');

        // Add click handlers
        suggestionsBox.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                const emailField = document.getElementById('email');
                const phoneField = document.getElementById('phone');
                nameInput.value = item.dataset.name;
                phoneField.value = obfuscatePhone(item.dataset.phone);
                phoneField.dataset.realPhone = item.dataset.phone;
                phoneField.dataset.isStoredUser = 'true';
                emailField.value = item.dataset.obfuscated;
                // Store real email separately for submission
                emailField.dataset.realEmail = item.dataset.email;
                emailField.dataset.isStoredUser = 'true';
                document.getElementById('clearPerson').classList.remove('hidden');
                document.getElementById('emailError').classList.add('hidden');
                suggestionsBox.classList.add('hidden');
            });
        });
    });

    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!nameInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
            suggestionsBox.classList.add('hidden');
        }
    });
}

function setupClearPerson() {
    document.getElementById('clearPerson').addEventListener('click', () => {
        const emailField = document.getElementById('email');
        const phoneField = document.getElementById('phone');
        document.getElementById('name').value = '';
        phoneField.value = '';
        emailField.value = '';
        emailField.dataset.realEmail = '';
        delete emailField.dataset.isStoredUser;
        phoneField.dataset.realPhone = '';
        delete phoneField.dataset.isStoredUser;
        document.getElementById('clearPerson').classList.add('hidden');
        document.getElementById('emailError').classList.add('hidden');
    });

    // Clear stored user flag when manually editing email
    document.getElementById('email').addEventListener('input', () => {
        const emailField = document.getElementById('email');
        if (emailField.dataset.isStoredUser) {
            delete emailField.dataset.isStoredUser;
            delete emailField.dataset.realEmail;
            document.getElementById('emailError').classList.add('hidden');
        }
    });

    // Clear stored user flag when manually editing phone and format as user types
    document.getElementById('phone').addEventListener('input', (e) => {
        const phoneField = e.target;

        // Clear stored user flag if editing stored phone
        if (phoneField.dataset.isStoredUser) {
            delete phoneField.dataset.isStoredUser;
            delete phoneField.dataset.realPhone;
        }

        // Only format if not stored user (manual entry)
        if (!phoneField.dataset.isStoredUser) {
            const input = phoneField.value.replace(/\D/g, '');
            let formatted = '';

            if (input.length > 0) {
                if (input.length <= 3) {
                    formatted = input;
                } else if (input.length <= 6) {
                    formatted = `(${input.slice(0, 3)}) ${input.slice(3)}`;
                } else {
                    formatted = `(${input.slice(0, 3)}) ${input.slice(3, 6)}-${input.slice(6, 10)}`;
                }
            }

            phoneField.value = formatted;
        }
    });
}

function showSuccess() {
    const msg = document.getElementById('successMessage');
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 3000);
}

function updateStats() {
    const checkins = getCheckins();
    document.getElementById('recordCount').textContent = `Total check-ins: ${checkins.length} | People in database: ${getPeople().length}`;
    loadRecentList();
    loadEventList();
}

function obfuscatePhone(phone) {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
        return `(***) ***-${cleaned.slice(6, 10)}`;
    }
    return phone;
}

function obfuscateEmail(email) {
    const [local, domain] = email.split('@');
    const localPrefix = local.length >= 3 ? local.slice(0, 3) : local;

    // Split domain into parts (e.g., ['bannergecko', 'com'])
    const domainParts = domain.split('.');
    const tld = domainParts[domainParts.length - 1]; // 'com'
    const mainDomain = domainParts.slice(0, -1).join('.'); // 'bannergecko'
    const domainSuffix = mainDomain.length >= 3 ? mainDomain.slice(-3) : mainDomain; // 'cko'

    return `${localPrefix}...@...${domainSuffix}.${tld}`;
}

function formatPhone(phone) {
    // Strip all non-numeric characters
    const cleaned = phone.replace(/\D/g, '');

    // Check if we have 10 digits
    if (cleaned.length === 10) {
        return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }

    // Return original if not 10 digits
    return phone;
}

function stripPhoneFormatting(phone) {
    return phone.replace(/\D/g, '');
}

function sanitizeFilename(name) {
    return name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function exportJSON() {
    const eventFilter = document.getElementById('exportEvent').value;
    const checkins = getCheckins();
    const events = getEvents();

    // Group checkins by event
    const checkinsByEvent = {};
    checkins.forEach(c => {
        if (!eventFilter || c.event === eventFilter) {
            if (!checkinsByEvent[c.event]) {
                checkinsByEvent[c.event] = [];
            }
            checkinsByEvent[c.event].push(c);
        }
    });

    if (Object.keys(checkinsByEvent).length === 0) {
        alert('No data to export');
        return;
    }

    // Export each event as a separate file
    Object.entries(checkinsByEvent).forEach(([eventName, eventCheckins]) => {
        const eventSlug = sanitizeFilename(eventName);
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `lathrop-checkins-${eventSlug}-${dateStr}.json`;

        const data = JSON.stringify(eventCheckins, null, 2);
        downloadFile(data, filename, 'application/json');
    });
}

function exportCSV() {
    const eventFilter = document.getElementById('exportEvent').value;
    const checkins = getCheckins();
    const events = getEvents();

    // Group checkins by event
    const checkinsByEvent = {};
    checkins.forEach(c => {
        if (!eventFilter || c.event === eventFilter) {
            if (!checkinsByEvent[c.event]) {
                checkinsByEvent[c.event] = [];
            }
            checkinsByEvent[c.event].push(c);
        }
    });

    if (Object.keys(checkinsByEvent).length === 0) {
        alert('No data to export');
        return;
    }

    // Export each event as a separate file
    Object.entries(checkinsByEvent).forEach(([eventName, eventCheckins]) => {
        const eventSlug = sanitizeFilename(eventName);
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `lathrop-checkins-${eventSlug}-${dateStr}.csv`;

        const headers = ['Name', 'Phone', 'Email', 'Event', 'Date', 'Time'];
        const rows = eventCheckins.map(c => {
            const date = new Date(c.timestamp);
            return [
                c.name,
                formatPhone(c.phone),
                c.email,
                c.event,
                date.toLocaleDateString(),
                date.toLocaleTimeString()
            ];
        });

        const csv = [headers, ...rows]
            .map(row => row.map(cell => `"${cell}"`).join(','))
            .join('\n');

        downloadFile(csv, filename, 'text/csv');
    });
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function clearData() {
    if (confirm('Are you sure you want to delete ALL check-in data? This cannot be undone.')) {
        localStorage.removeItem(STORAGE_KEYS.CHECKINS);
        localStorage.removeItem(STORAGE_KEYS.PEOPLE);
        updateStats();
    }
}

// Admin login functions
function tryOpenAdmin() {
    if (isAdminLoggedIn) {
        openAdmin();
    } else {
        showLoginModal();
    }
}

function showLoginModal() {
    document.getElementById('loginModal').classList.remove('hidden');
    document.getElementById('username').focus();
}

function closeLoginModal() {
    document.getElementById('loginModal').classList.add('hidden');
    document.getElementById('loginForm').reset();
    document.getElementById('loginError').classList.add('hidden');
}

function openAdmin() {
    document.getElementById('adminContent').classList.remove('hidden');
}

function closeAdmin() {
    document.getElementById('adminContent').classList.add('hidden');
}

function logout() {
    isAdminLoggedIn = false;
    closeAdmin();
}

// Login form submission
document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
        isAdminLoggedIn = true;
        closeLoginModal();
        openAdmin();
    } else {
        document.getElementById('loginError').classList.remove('hidden');
    }
});

function loadRecentList() {
    const list = document.getElementById('recentList');
    const checkins = getCheckins().slice(-10).reverse();

    if (checkins.length === 0) {
        list.innerHTML = '<p class="text-gray-400">No check-ins yet</p>';
        return;
    }

    list.innerHTML = checkins.map(c => {
        const date = new Date(c.timestamp);
        return `<div class="border-b border-gray-100 py-2">
            <div class="font-medium">${c.name}</div>
            <div class="text-gray-500">${formatPhone(c.phone)} · ${c.event} - ${date.toLocaleDateString()} ${date.toLocaleTimeString()}</div>
        </div>`;
    }).join('');
}
