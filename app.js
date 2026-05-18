const APP_VERSION = '2.3.0';
console.log(`GLCC Check-In v${APP_VERSION} | Supabase centralized | Loaded: ${new Date().toLocaleString()}`);

const SUPABASE_URL = 'https://iqloilzpgsgwhctgmikj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_nBMYllsXrBKyuvW_i61Lpw_N0vOT1BI';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentSession = null;
let cachedPeople = [];

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await db.auth.getSession();
    currentSession = session;

    await loadEventSelect();
    await loadExportEventSelect();
    setupNameSearch();
    setupClearPerson();

    if (currentSession) {
        await fetchPeople();
        openAdmin();
    }
});

// Form submission
document.getElementById('checkinForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const emailField = document.getElementById('email');
    const phoneField = document.getElementById('phone');
    const email = (emailField.dataset.realEmail || emailField.value).trim();
    const phone = (phoneField.dataset.realPhone || stripPhoneFormatting(phoneField.value));
    const eventName = document.getElementById('event').value;

    if (!emailField.dataset.isStoredUser) {
        const validation = isValidEmail(email);
        if (!validation.valid) {
            document.getElementById('emailError').textContent = validation.error;
            document.getElementById('emailError').classList.remove('hidden');
            return;
        }
    }

    if (!phoneField.dataset.isStoredUser) {
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length !== 10) {
            alert('Please enter a valid 10-digit phone number');
            return;
        }
    }

    document.getElementById('emailError').classList.add('hidden');

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Checking in...';

    const checkin = {
        name: document.getElementById('name').value.trim(),
        phone,
        email,
        event: eventName,
        timestamp: new Date().toISOString()
    };

    const { error } = await db.from('checkins').insert(checkin);

    if (error) {
        if (error.code === '23505') {
            alert(`${email} is already checked into ${eventName}.`);
        } else {
            alert('Check-in failed. Please try again.');
            console.error(error);
        }
        submitBtn.disabled = false;
        submitBtn.textContent = 'Check In';
        return;
    }

    await db.from('people').upsert(
        { name: checkin.name, phone: checkin.phone, email: checkin.email, last_seen: checkin.timestamp },
        { onConflict: 'email' }
    );

    const idx = cachedPeople.findIndex(p => p.email === checkin.email);
    if (idx >= 0) {
        cachedPeople[idx] = { ...cachedPeople[idx], name: checkin.name, phone: checkin.phone };
    } else {
        cachedPeople.push({ name: checkin.name, phone: checkin.phone, email: checkin.email });
    }

    showSuccess();
    resetForm();
    if (currentSession) await updateStats();

    submitBtn.disabled = false;
    submitBtn.textContent = 'Check In';
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
    loadEventSelect();
}

// --- Event functions ---

async function getEvents() {
    const { data, error } = await db.from('events').select('name').order('created_at');
    if (error) { console.error('getEvents:', error); return []; }
    return data.map(row => row.name);
}

async function deleteEvent(eventName) {
    await db.from('events').delete().eq('name', eventName);
    await loadEventSelect();
    await loadExportEventSelect();
    await loadEventList();
}

async function loadEventSelect() {
    const select = document.getElementById('event');
    const currentValue = select.value;
    const events = await getEvents();

    select.innerHTML = '<option value="">Select an event...</option>';
    events.forEach(event => {
        const option = document.createElement('option');
        option.value = event;
        option.textContent = event;
        select.appendChild(option);
    });

    if (events.includes(currentValue)) {
        select.value = currentValue;
    } else if (events.length === 1) {
        select.value = events[0];
    }
}

async function loadExportEventSelect() {
    const select = document.getElementById('exportEvent');
    const events = await getEvents();

    select.innerHTML = '<option value="">All Events</option>';
    events.forEach(event => {
        const option = document.createElement('option');
        option.value = event;
        option.textContent = event;
        select.appendChild(option);
    });
}

async function addEvent() {
    const input = document.getElementById('newEvent');
    const eventName = input.value.trim();
    if (!eventName) return;

    const { error } = await db.from('events').insert({ name: eventName });
    if (!error) {
        input.value = '';
        await loadEventSelect();
        await loadExportEventSelect();
        await loadEventList();
    }
}

async function loadEventList() {
    const list = document.getElementById('eventList');
    const events = await getEvents();

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

// --- People ---

async function fetchPeople() {
    const { data, error } = await db.from('people').select('name, phone, email');
    if (!error) cachedPeople = data || [];
}

function getPeople() {
    return cachedPeople;
}

// --- Stats and recent list ---

async function updateStats() {
    const { count: checkinCount } = await db.from('checkins').select('*', { count: 'exact', head: true });
    const { count: peopleCount } = await db.from('people').select('*', { count: 'exact', head: true });
    document.getElementById('recordCount').textContent =
        `Total check-ins: ${checkinCount ?? 0} | People in database: ${peopleCount ?? 0}`;
    await loadRecentList();
    await loadEventList();
}

async function loadRecentList() {
    const list = document.getElementById('recentList');
    const { data } = await db.from('checkins')
        .select('name, phone, event, timestamp')
        .order('timestamp', { ascending: false })
        .limit(10);

    if (!data || data.length === 0) {
        list.innerHTML = '<p class="text-gray-400">No check-ins yet</p>';
        return;
    }

    list.innerHTML = data.map(c => {
        const date = new Date(c.timestamp);
        return `<div class="border-b border-gray-100 py-2">
            <div class="font-medium">${c.name}</div>
            <div class="text-gray-500">${formatPhone(c.phone)} · ${c.event} - ${date.toLocaleDateString()} ${date.toLocaleTimeString()}</div>
        </div>`;
    }).join('');
}

// --- Exports ---

async function exportJSON() {
    const eventFilter = document.getElementById('exportEvent').value;
    let query = db.from('checkins').select('name, phone, email, event, timestamp').order('timestamp');
    if (eventFilter) query = query.eq('event', eventFilter);

    const { data, error } = await query;
    if (error || !data || data.length === 0) { alert('No data to export'); return; }

    const checkinsByEvent = {};
    data.forEach(c => {
        if (!checkinsByEvent[c.event]) checkinsByEvent[c.event] = [];
        checkinsByEvent[c.event].push(c);
    });

    Object.entries(checkinsByEvent).forEach(([eventName, eventCheckins]) => {
        const dateStr = new Date().toISOString().split('T')[0];
        downloadFile(
            JSON.stringify(eventCheckins, null, 2),
            `lathrop-checkins-${sanitizeFilename(eventName)}-${dateStr}.json`,
            'application/json'
        );
    });
}

async function exportCSV() {
    const eventFilter = document.getElementById('exportEvent').value;
    let query = db.from('checkins').select('name, phone, email, event, timestamp').order('timestamp');
    if (eventFilter) query = query.eq('event', eventFilter);

    const { data, error } = await query;
    if (error || !data || data.length === 0) { alert('No data to export'); return; }

    const checkinsByEvent = {};
    data.forEach(c => {
        if (!checkinsByEvent[c.event]) checkinsByEvent[c.event] = [];
        checkinsByEvent[c.event].push(c);
    });

    Object.entries(checkinsByEvent).forEach(([eventName, eventCheckins]) => {
        const dateStr = new Date().toISOString().split('T')[0];
        const headers = ['Name', 'Phone', 'Email', 'Event', 'Date', 'Time'];
        const rows = eventCheckins.map(c => {
            const date = new Date(c.timestamp);
            return [c.name, formatPhone(c.phone), c.email, c.event, date.toLocaleDateString(), date.toLocaleTimeString()];
        });
        const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        downloadFile(csv, `lathrop-checkins-${sanitizeFilename(eventName)}-${dateStr}.csv`, 'text/csv');
    });
}

async function clearData() {
    if (confirm('Are you sure you want to delete ALL check-in data? This cannot be undone.')) {
        await db.from('checkins').delete().not('id', 'is', null);
        await db.from('people').delete().not('id', 'is', null);
        cachedPeople = [];
        await updateStats();
    }
}

// --- Auth ---

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
    document.getElementById('adminLoginBtn').classList.add('hidden');
    document.getElementById('adminCard').classList.remove('hidden');
    updateStats();
    loadExportEventSelect();
}

function closeAdmin() {
    document.getElementById('adminCard').classList.add('hidden');
    document.getElementById('adminLoginBtn').classList.remove('hidden');
}

async function logout() {
    await db.auth.signOut();
    currentSession = null;
    cachedPeople = [];
    closeAdmin();
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const loginBtn = e.target.querySelector('button[type="submit"]');

    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';

    const { data, error } = await db.auth.signInWithPassword({ email, password });

    if (error) {
        document.getElementById('loginError').classList.remove('hidden');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
        return;
    }

    currentSession = data.session;
    await fetchPeople();
    closeLoginModal();
    openAdmin();
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
});

// --- Name search / autocomplete ---

function setupNameSearch() {
    const nameInput = document.getElementById('name');
    const suggestionsBox = document.getElementById('nameSuggestions');

    nameInput.addEventListener('input', () => {
        const query = nameInput.value.trim().toLowerCase();

        if (query.length < 2) {
            suggestionsBox.classList.add('hidden');
            return;
        }

        const matches = getPeople().filter(p =>
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

        suggestionsBox.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                const emailField = document.getElementById('email');
                const phoneField = document.getElementById('phone');
                nameInput.value = item.dataset.name;
                phoneField.value = obfuscatePhone(item.dataset.phone);
                phoneField.dataset.realPhone = item.dataset.phone;
                phoneField.dataset.isStoredUser = 'true';
                emailField.value = item.dataset.obfuscated;
                emailField.dataset.realEmail = item.dataset.email;
                emailField.dataset.isStoredUser = 'true';
                document.getElementById('clearPerson').classList.remove('hidden');
                document.getElementById('emailError').classList.add('hidden');
                suggestionsBox.classList.add('hidden');
            });
        });
    });

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

    document.getElementById('email').addEventListener('input', () => {
        const emailField = document.getElementById('email');
        if (emailField.dataset.isStoredUser) {
            delete emailField.dataset.isStoredUser;
            delete emailField.dataset.realEmail;
            document.getElementById('emailError').classList.add('hidden');
        }
    });

    document.getElementById('phone').addEventListener('input', (e) => {
        const phoneField = e.target;
        if (phoneField.dataset.isStoredUser) {
            delete phoneField.dataset.isStoredUser;
            delete phoneField.dataset.realPhone;
        }
        if (!phoneField.dataset.isStoredUser) {
            const input = phoneField.value.replace(/\D/g, '');
            let formatted = '';
            if (input.length > 0) {
                if (input.length <= 3) formatted = input;
                else if (input.length <= 6) formatted = `(${input.slice(0, 3)}) ${input.slice(3)}`;
                else formatted = `(${input.slice(0, 3)}) ${input.slice(3, 6)}-${input.slice(6, 10)}`;
            }
            phoneField.value = formatted;
        }
    });
}

// --- Helpers ---

function showSuccess() {
    const msg = document.getElementById('successMessage');
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 3000);
}

function isValidEmail(email) {
    if (!email || email.length === 0) return { valid: false, error: 'Email is required' };
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return { valid: false, error: 'Please enter a valid email address (e.g., name@example.com)' };
    if (email.includes('...')) return { valid: false, error: 'Please enter a complete email address' };
    if ((email.match(/@/g) || []).length > 1) return { valid: false, error: 'Email can only contain one @ symbol' };
    const [, domain] = email.split('@');
    if (!domain || !domain.includes('.') || domain.split('.')[1]?.length < 2) return { valid: false, error: 'Please enter a valid email domain' };
    return { valid: true };
}

function obfuscatePhone(phone) {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) return `(***) ***-${cleaned.slice(6, 10)}`;
    return phone;
}

function obfuscateEmail(email) {
    const [local, domain] = email.split('@');
    const localPrefix = local.length >= 3 ? local.slice(0, 3) : local;
    const domainParts = domain.split('.');
    const tld = domainParts[domainParts.length - 1];
    const mainDomain = domainParts.slice(0, -1).join('.');
    const domainSuffix = mainDomain.length >= 3 ? mainDomain.slice(-3) : mainDomain;
    return `${localPrefix}...@...${domainSuffix}.${tld}`;
}

function formatPhone(phone) {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    return phone;
}

function stripPhoneFormatting(phone) {
    return phone.replace(/\D/g, '');
}

function sanitizeFilename(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
