const APP_VERSION = '2.5.0';
console.log(`GLCC Check-In v${APP_VERSION} | Loaded: ${new Date().toLocaleString()}`);

const SUPABASE_URL = 'https://iqloilzpgsgwhctgmikj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_nBMYllsXrBKyuvW_i61Lpw_N0vOT1BI';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentSession = null;
let cachedPeople = [];
let activeEventName = null;
let activeEventDate = null;

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await db.auth.getSession();
    currentSession = session;

    document.getElementById('newEventDate').value = new Date().toLocaleDateString('en-CA');

    await loadActiveEvent();
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

    if (!activeEventName) {
        alert('No active event. An admin must set one first.');
        return;
    }

    const emailField = document.getElementById('email');
    const phoneField = document.getElementById('phone');
    const email = (emailField.dataset.realEmail || emailField.value).trim();
    const phone = (phoneField.dataset.realPhone || stripPhoneFormatting(phoneField.value));

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
        event: activeEventName,
        timestamp: new Date().toISOString()
    };

    const { error } = await db.from('checkins').insert(checkin);

    if (error) {
        if (error.code === '23505') {
            alert(`${email} is already checked into ${activeEventName}.`);
        } else {
            alert('Check-in failed. Please try again.');
            console.error(error);
        }
        submitBtn.disabled = false;
        submitBtn.textContent = 'Check In';
        return;
    }

    const { error: personError } = await db.rpc('upsert_person', {
        p_name: checkin.name,
        p_phone: checkin.phone,
        p_email: checkin.email,
        p_last_seen: checkin.timestamp
    });
    if (personError) console.error('Person upsert error:', personError);

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
}

// --- Active event ---

async function loadActiveEvent() {
    const { data } = await db.from('events').select('name, event_date').eq('is_active', true).maybeSingle();
    activeEventName = data?.name || null;
    activeEventDate = data?.event_date || null;
    updateActiveEventDisplay();
}

function updateActiveEventDisplay() {
    const el = document.getElementById('activeEventName');
    if (activeEventName) {
        const dateStr = activeEventDate ? ` · ${formatEventDate(activeEventDate)}` : '';
        el.textContent = activeEventName + dateStr;
        el.classList.remove('text-gray-400');
        el.classList.add('text-gray-800', 'font-medium');
    } else {
        el.textContent = 'No active event selected';
        el.classList.add('text-gray-400');
        el.classList.remove('text-gray-800', 'font-medium');
    }
}

async function setActiveEvent(eventName, eventDate) {
    await db.from('events').update({ is_active: false }).not('id', 'is', null);
    await db.from('events').update({ is_active: true }).eq('name', eventName);
    activeEventName = eventName;
    activeEventDate = eventDate || null;
    updateActiveEventDisplay();
    await loadEventList();
}

function formatEventDate(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// --- Event functions ---

async function getEvents() {
    const { data, error } = await db.from('events').select('name, event_date, is_active').order('created_at');
    if (error) { console.error('getEvents:', error); return []; }
    return data;
}

async function deleteEvent(eventName) {
    await db.from('events').delete().eq('name', eventName);
    if (activeEventName === eventName) {
        activeEventName = null;
        updateActiveEventDisplay();
    }
    await loadEventList();
    await loadExportEventSelect();
}

async function loadExportEventSelect() {
    const select = document.getElementById('exportEvent');
    const events = await getEvents();

    select.innerHTML = '<option value="">All Events</option>';
    events.forEach(e => {
        const option = document.createElement('option');
        option.value = e.name;
        option.textContent = e.name;
        select.appendChild(option);
    });
}

async function addEvent() {
    const input = document.getElementById('newEvent');
    const dateInput = document.getElementById('newEventDate');
    const eventName = input.value.trim();
    const eventDate = dateInput.value || null;
    if (!eventName) return;

    const { error } = await db.from('events').insert({ name: eventName, event_date: eventDate });
    if (!error) {
        input.value = '';
        dateInput.value = new Date().toLocaleDateString('en-CA');
        await loadEventList();
        await loadExportEventSelect();
    }
}

async function loadEventList() {
    const list = document.getElementById('eventList');
    const events = await getEvents();

    if (events.length === 0) {
        list.innerHTML = '<p class="text-gray-400">No events configured</p>';
        return;
    }

    list.innerHTML = events.map((e, i) => {
        const isActive = e.is_active;
        const dateDisplay = e.event_date ? `<span class="text-xs text-gray-500 ml-2">${formatEventDate(e.event_date)}</span>` : '';
        return `
        <div id="event-row-${i}" class="flex items-center justify-between px-4 py-3 rounded-lg ${isActive ? 'bg-indigo-50 border border-indigo-200' : 'bg-gray-50 border border-gray-200'}">
            <div class="flex items-center gap-3">
                <span class="text-base ${isActive ? 'font-semibold text-indigo-700' : 'text-gray-700'}">${e.name}</span>
                ${dateDisplay}
                ${isActive ? '<span class="text-xs font-medium px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded-full">Active</span>' : ''}
            </div>
            <div class="flex gap-2">
                ${!isActive ? `<button onclick="setActiveEvent('${e.name}', '${e.event_date || ''}')" class="text-xs px-3 py-1.5 bg-white border border-indigo-300 text-indigo-600 rounded-lg hover:bg-indigo-50 font-medium">Set Active</button>` : ''}
                <button onclick="showEditEvent(${i}, '${e.name}', '${e.event_date || ''}')" class="text-xs px-3 py-1.5 bg-white border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 font-medium">Edit</button>
                <button onclick="deleteEvent('${e.name}')" class="text-xs px-3 py-1.5 bg-white border border-red-200 text-red-500 rounded-lg hover:bg-red-50 font-medium">Remove</button>
            </div>
        </div>`;
    }).join('');
}

function showEditEvent(i, name, date) {
    const row = document.getElementById(`event-row-${i}`);
    row.className = 'flex items-center gap-2 px-4 py-3 rounded-lg bg-white border border-indigo-300';
    row.innerHTML = `
        <input type="text" id="edit-name-${i}" value="${name}" class="input-sm flex-1 px-3 py-1.5 border border-gray-300 rounded-lg">
        <input type="date" id="edit-date-${i}" value="${date}" class="input-sm w-auto px-3 py-1.5 border border-gray-300 rounded-lg">
        <button onclick="saveEventEdit('${name}', ${i})" class="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">Save</button>
        <button onclick="loadEventList()" class="text-xs px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium">Cancel</button>`;
}

async function saveEventEdit(oldName, i) {
    const newName = document.getElementById(`edit-name-${i}`).value.trim();
    const newDate = document.getElementById(`edit-date-${i}`).value || null;
    if (!newName) return;

    const { error } = await db.from('events').update({ name: newName, event_date: newDate }).eq('name', oldName);
    if (error) { console.error('Edit event error:', error); return; }

    if (activeEventName === oldName) {
        activeEventName = newName;
        activeEventDate = newDate;
        updateActiveEventDisplay();
    }

    await loadEventList();
    await loadExportEventSelect();
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
        .select('name, phone, email, event, timestamp')
        .order('timestamp', { ascending: false })
        .limit(10);

    if (!data || data.length === 0) {
        list.innerHTML = '<p class="text-gray-400">No check-ins yet</p>';
        return;
    }

    list.innerHTML = data.map(c => {
        const date = new Date(c.timestamp);
        return `<div class="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            <div class="font-medium text-gray-800">${c.name}</div>
            <div class="text-sm text-gray-500 mt-1">${formatPhone(c.phone)} · ${c.email}</div>
            <div class="text-sm text-gray-400 mt-1">${c.event} · ${date.toLocaleDateString()} ${date.toLocaleTimeString()}</div>
        </div>`;
    }).join('');
}

// --- Export ---

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
    document.getElementById('checkinCard').classList.add('hidden');
    document.getElementById('adminLoginBtn').classList.add('hidden');
    document.getElementById('adminCard').classList.remove('hidden');
    document.getElementById('mainContainer').style.maxWidth = '56rem';
    updateStats();
    loadExportEventSelect();
}

function closeAdmin() {
    document.getElementById('adminCard').classList.add('hidden');
    document.getElementById('adminLoginBtn').classList.remove('hidden');
    document.getElementById('checkinCard').classList.remove('hidden');
    document.getElementById('mainContainer').style.maxWidth = '';
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
