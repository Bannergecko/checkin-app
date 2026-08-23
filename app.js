const APP_VERSION = '2.6.0';
console.log(`GLCC Check-In v${APP_VERSION} | Loaded: ${new Date().toLocaleString()}`);

const SUPABASE_URL = 'https://iqloilzpgsgwhctgmikj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_nBMYllsXrBKyuvW_i61Lpw_N0vOT1BI';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentSession = null;
let cachedPeople = [];
let activeEventName = null;
let activeEventDate = null;
let cachedBrandingProfiles = [];

document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await db.auth.getSession();
    currentSession = session;

    document.getElementById('newEventDate').value = new Date().toLocaleDateString('en-CA');

    await fetchPeople();
    await loadActiveEvent();
    await loadExportEventSelect();
    await loadActiveBranding();
    setupNameSearch();
    setupClearPerson();
    setupBrandingForm();

    if (currentSession) {
        openAdmin();
    }
});

// --- Branding / Profiles ---

function applyBranding(profile) {
    const root = document.documentElement.style;
    root.setProperty('--primary-color', profile.primary_color || '#c0272d');
    root.setProperty('--text-color', profile.text_color || '#1c2b4a');
    root.setProperty('--bg-color', profile.background_color || '#ffffff');
    if (profile.logo_data) {
        document.getElementById('siteLogo').src = profile.logo_data;
    }
    document.getElementById('siteHeading').textContent = profile.heading_text || 'Member Check-In';
    document.getElementById('siteFooter').textContent = profile.footer_text || '';
}

async function loadActiveBranding() {
    const { data, error } = await db.from('branding_profiles').select('*').eq('is_active', true).maybeSingle();
    if (!error && data) applyBranding(data);
}

async function getBrandingProfiles() {
    const { data, error } = await db.from('branding_profiles').select('*').order('created_at');
    if (error) { console.error('getBrandingProfiles:', error); return []; }
    return data;
}

async function loadBrandingList() {
    const list = document.getElementById('brandingList');
    const profiles = await getBrandingProfiles();
    cachedBrandingProfiles = profiles;

    if (profiles.length === 0) {
        list.innerHTML = '<p class="text-gray-400 text-sm">No saved profiles yet</p>';
        return;
    }

    list.innerHTML = profiles.map((p, i) => renderBrandingRow(p, i)).join('');
}

function renderBrandingRow(p, i) {
    const isActive = p.is_active;
    const thumb = p.logo_data
        ? `<img src="${p.logo_data}" alt="" class="w-8 h-8" style="object-fit: contain;">`
        : '<div class="w-8 h-8 bg-gray-100 rounded"></div>';
    return `
    <div id="branding-row-${i}" class="event-row px-4 py-3 rounded-lg ${isActive ? 'bg-indigo-50 border border-indigo-200' : 'bg-gray-50 border border-gray-200'}">
        <div class="event-row-info flex items-center gap-3">
            ${thumb}
            <span class="text-base ${isActive ? 'font-semibold text-indigo-700' : 'text-gray-700'}">${p.name}</span>
            ${isActive ? '<span class="text-xs font-medium px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded-full">Active</span>' : ''}
        </div>
        <div class="event-row-actions flex gap-2">
            ${!isActive ? `<button onclick="setActiveBranding(${p.id})" class="text-xs px-3 py-1.5 bg-white border border-indigo-300 text-indigo-600 rounded-lg hover:bg-indigo-50 font-medium">Set Active</button>` : ''}
            <button onclick="showEditBranding(${i})" class="text-xs px-3 py-1.5 bg-white border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 font-medium">Edit</button>
            <button onclick="deleteBranding(${p.id}, ${isActive})" class="text-xs px-3 py-1.5 bg-white border border-red-200 text-red-500 rounded-lg hover:bg-red-50 font-medium">Remove</button>
        </div>
    </div>`;
}

function showEditBranding(i) {
    const p = cachedBrandingProfiles[i];
    const row = document.getElementById(`branding-row-${i}`);
    row.className = 'edit-event-row px-4 py-3 rounded-lg bg-white border border-indigo-300';
    row.innerHTML = `
        <input type="text" id="edit-brand-name-${i}" value="${escapeAttr(p.name)}" placeholder="Profile name"
            class="input-sm w-full px-3 py-1.5 border border-gray-300 rounded-lg">
        <div>
            <label class="block text-xs text-gray-500 mb-1">Replace logo (optional)</label>
            <input type="file" id="edit-brand-logo-${i}" accept="image/*" class="input-sm w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5">
        </div>
        <div class="flex gap-3">
            <div class="flex-1">
                <label class="block text-xs text-gray-500 mb-1">Accent</label>
                <input type="color" id="edit-brand-primary-${i}" value="${p.primary_color || '#c0272d'}" class="w-full h-9 border border-gray-300 rounded-lg">
            </div>
            <div class="flex-1">
                <label class="block text-xs text-gray-500 mb-1">Heading color</label>
                <input type="color" id="edit-brand-text-${i}" value="${p.text_color || '#1c2b4a'}" class="w-full h-9 border border-gray-300 rounded-lg">
            </div>
            <div class="flex-1">
                <label class="block text-xs text-gray-500 mb-1">Background</label>
                <input type="color" id="edit-brand-bg-${i}" value="${p.background_color || '#ffffff'}" class="w-full h-9 border border-gray-300 rounded-lg">
            </div>
        </div>
        <input type="text" id="edit-brand-heading-${i}" value="${escapeAttr(p.heading_text || '')}" placeholder="Heading text"
            class="input-sm w-full px-3 py-1.5 border border-gray-300 rounded-lg">
        <input type="text" id="edit-brand-footer-${i}" value="${escapeAttr(p.footer_text || '')}" placeholder="Footer text"
            class="input-sm w-full px-3 py-1.5 border border-gray-300 rounded-lg">
        <div class="edit-event-btns flex gap-2">
            <button onclick="saveBrandingEdit(${i})" class="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">Save</button>
            <button onclick="loadBrandingList()" class="text-xs px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium">Cancel</button>
        </div>`;
}

async function saveBrandingEdit(i) {
    const p = cachedBrandingProfiles[i];
    const logoFile = document.getElementById(`edit-brand-logo-${i}`).files[0];

    if (logoFile && logoFile.size > 800 * 1024) {
        showNotification('Logo file is too large. Please use an image under 800KB.');
        return;
    }

    const updates = {
        name: document.getElementById(`edit-brand-name-${i}`).value.trim(),
        primary_color: document.getElementById(`edit-brand-primary-${i}`).value,
        text_color: document.getElementById(`edit-brand-text-${i}`).value,
        background_color: document.getElementById(`edit-brand-bg-${i}`).value,
        heading_text: document.getElementById(`edit-brand-heading-${i}`).value.trim(),
        footer_text: document.getElementById(`edit-brand-footer-${i}`).value.trim()
    };
    if (!updates.name) return;

    if (logoFile) updates.logo_data = await fileToDataUrl(logoFile);

    const { data, error } = await db.from('branding_profiles').update(updates).eq('id', p.id).select().maybeSingle();
    if (error) { console.error('Branding update error:', error); showNotification('Failed to save changes.'); return; }

    if (p.is_active && data) applyBranding(data);
    await loadBrandingList();
}

function escapeAttr(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

async function setActiveBranding(id) {
    await db.from('branding_profiles').update({ is_active: false }).not('id', 'is', null);
    const { data, error } = await db.from('branding_profiles').update({ is_active: true }).eq('id', id).select().maybeSingle();
    if (!error && data) applyBranding(data);
    await loadBrandingList();
}

async function deleteBranding(id, wasActive) {
    await db.from('branding_profiles').delete().eq('id', id);
    if (wasActive) await loadActiveBranding();
    await loadBrandingList();
}

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function setupBrandingForm() {
    document.getElementById('brandingForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const errorEl = document.getElementById('brandingError');
        errorEl.classList.add('hidden');

        const name = document.getElementById('brandName').value.trim();
        const logoFile = document.getElementById('brandLogo').files[0];
        const primaryColor = document.getElementById('brandPrimary').value;
        const textColor = document.getElementById('brandText').value;
        const backgroundColor = document.getElementById('brandBg').value;
        const headingText = document.getElementById('brandHeading').value.trim();
        const footerText = document.getElementById('brandFooter').value.trim();

        if (!name) return;

        if (logoFile && logoFile.size > 800 * 1024) {
            errorEl.textContent = 'Logo file is too large. Please use an image under 800KB.';
            errorEl.classList.remove('hidden');
            return;
        }

        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';

        const logoData = logoFile ? await fileToDataUrl(logoFile) : null;

        const { error } = await db.from('branding_profiles').insert({
            name,
            logo_data: logoData,
            primary_color: primaryColor,
            text_color: textColor,
            background_color: backgroundColor,
            heading_text: headingText,
            footer_text: footerText
        });

        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Profile';

        if (error) {
            errorEl.textContent = 'Failed to save profile. Please try again.';
            errorEl.classList.remove('hidden');
            console.error('Branding save error:', error);
            return;
        }

        e.target.reset();
        document.getElementById('brandPrimary').value = '#c0272d';
        document.getElementById('brandText').value = '#1c2b4a';
        document.getElementById('brandBg').value = '#ffffff';
        await loadBrandingList();
    });
}

// Form submission
document.getElementById('checkinForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!activeEventName) {
        showNotification('No active event. An admin must set one first.');
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
            showNotification('Please enter a valid 10-digit phone number.');
            return;
        }
    }

    document.getElementById('emailError').classList.add('hidden');

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Checking in...';

    const checkin = {
        name: document.getElementById('name').value.trim(),
        company: document.getElementById('company').value.trim() || null,
        phone,
        email,
        event: activeEventName,
        timestamp: new Date().toISOString()
    };

    const { error } = await db.from('checkins').insert(checkin);

    if (error) {
        if (error.code === '23505') {
            document.getElementById('duplicateError')?.classList.remove('hidden');
        } else {
            showNotification('Check-in failed. Please try again.');
            console.error(error);
        }
        submitBtn.disabled = false;
        submitBtn.textContent = 'Check In';
        return;
    }

    const companyField = document.getElementById('company');
    const storedCompany = companyField.dataset.storedCompany;
    // For stored users: keep their existing company; only update if they had none and typed one
    const companyForRecord = (emailField.dataset.isStoredUser && storedCompany)
        ? storedCompany
        : checkin.company;

    const { error: personError } = await db.rpc('upsert_person', {
        p_name: checkin.name,
        p_company: companyForRecord,
        p_phone: checkin.phone,
        p_email: checkin.email,
        p_last_seen: checkin.timestamp
    });
    if (personError) console.error('Person upsert error:', personError);

    const idx = cachedPeople.findIndex(p => p.email === checkin.email);
    if (idx >= 0) {
        cachedPeople[idx] = { ...cachedPeople[idx], name: checkin.name, company: checkin.company, phone: checkin.phone };
    } else {
        cachedPeople.push({ name: checkin.name, company: checkin.company, phone: checkin.phone, email: checkin.email });
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
    document.getElementById('duplicateError')?.classList.add('hidden');
}

// --- Active event ---

async function loadActiveEvent() {
    const { data } = await db.from('events').select('name, event_date').eq('is_active', true).maybeSingle();
    if (data && isDateInPast(data.event_date)) {
        await db.from('events').update({ is_active: false }).eq('name', data.name);
        activeEventName = null;
        activeEventDate = null;
    } else {
        activeEventName = data?.name || null;
        activeEventDate = data?.event_date || null;
    }
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

function showNotification(message, type = 'error') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.backgroundColor = type === 'error' ? '#dc2626' : '#1f2937';
    toast.classList.remove('hidden');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.add('hidden'), 4000);
}

async function setActiveEvent(eventName, eventDate) {
    if (isDateInPast(eventDate)) {
        showNotification('This event occurs in the past and therefore cannot be made active.');
        return;
    }
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

function isDateInPast(dateStr) {
    if (!dateStr) return false;
    const [year, month, day] = dateStr.split('-').map(Number);
    const eventDate = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return eventDate < today;
}

// --- Event functions ---

async function getEvents() {
    const { data, error } = await db.from('events').select('name, event_date, is_active').order('created_at');
    if (error) { console.error('getEvents:', error); return []; }
    return data;
}

function confirmDeleteEvent(i, eventName) {
    const row = document.getElementById(`event-row-${i}`);
    row.className = 'px-4 py-3 rounded-lg bg-red-50 border border-red-200';
    row.innerHTML = `
        <p class="text-sm text-red-700 mb-3">You are about to delete an event. If any check-ins were made to this event they will also be deleted. Please be sure you have exported this event to CSV if you need to keep the check-in data.</p>
        <div class="flex gap-2 justify-end">
            <button onclick="executeDeleteEvent('${eventName}')" class="text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg font-medium">Delete Event</button>
            <button onclick="exportAndDeleteEvent('${eventName}')" class="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg font-medium">Export and Delete</button>
            <button onclick="loadEventList()" class="text-xs px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium">Cancel</button>
        </div>`;
}

async function executeDeleteEvent(eventName) {
    await db.from('checkins').delete().eq('event', eventName);
    await db.from('events').delete().eq('name', eventName);
    if (activeEventName === eventName) {
        activeEventName = null;
        activeEventDate = null;
        updateActiveEventDisplay();
    }
    await loadEventList();
    await loadExportEventSelect();
    await updateStats();
}

async function exportAndDeleteEvent(eventName) {
    const { data, error } = await db.from('checkins').select('name, company, phone, email, event, timestamp').eq('event', eventName).order('timestamp');
    if (!error && data && data.length > 0) {
        const dateStr = new Date().toISOString().split('T')[0];
        const headers = ['Name', 'Company', 'Phone', 'Email', 'Event', 'Date', 'Time'];
        const rows = data.map(c => {
            const date = new Date(c.timestamp);
            return [c.name, c.company || '', formatPhone(c.phone), c.email, c.event, date.toLocaleDateString(), date.toLocaleTimeString()];
        });
        const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        downloadFile(csv, `lathrop-checkins-${sanitizeFilename(eventName)}-${dateStr}.csv`, 'text/csv');
    }
    await executeDeleteEvent(eventName);
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

    if (isDateInPast(eventDate)) {
        showNotification('Events cannot be created with a past date.');
        return;
    }

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

    // Single event: always keep it active unless its date is in the past
    if (events.length === 1 && !events[0].is_active && !isDateInPast(events[0].event_date)) {
        await db.from('events').update({ is_active: true }).eq('name', events[0].name);
        events[0].is_active = true;
        activeEventName = events[0].name;
        activeEventDate = events[0].event_date || null;
        updateActiveEventDisplay();
    }

    list.innerHTML = events.map((e, i) => {
        const isActive = e.is_active;
        const dateDisplay = e.event_date ? `<span class="event-row-date text-xs text-gray-500">${formatEventDate(e.event_date)}</span>` : '';
        return `
        <div id="event-row-${i}" class="event-row px-4 py-3 rounded-lg ${isActive ? 'bg-indigo-50 border border-indigo-200' : 'bg-gray-50 border border-gray-200'}">
            <div class="event-row-info flex items-center gap-3">
                <span class="text-base ${isActive ? 'font-semibold text-indigo-700' : 'text-gray-700'}">${e.name}</span>
                ${dateDisplay}
                ${isActive ? '<span class="text-xs font-medium px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded-full">Active</span>' : ''}
            </div>
            <div class="event-row-actions flex gap-2">
                ${!isActive ? `<button onclick="setActiveEvent('${e.name}', '${e.event_date || ''}')" class="text-xs px-3 py-1.5 bg-white border border-indigo-300 text-indigo-600 rounded-lg hover:bg-indigo-50 font-medium">Set Active</button>` : ''}
                <button onclick="showEditEvent(${i}, '${e.name}', '${e.event_date || ''}')" class="text-xs px-3 py-1.5 bg-white border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 font-medium">Edit</button>
                <button onclick="confirmDeleteEvent(${i}, '${e.name}')" class="text-xs px-3 py-1.5 bg-white border border-red-200 text-red-500 rounded-lg hover:bg-red-50 font-medium">Remove</button>
            </div>
        </div>`;
    }).join('');
}

function showEditEvent(i, name, date) {
    const row = document.getElementById(`event-row-${i}`);
    row.className = 'edit-event-row px-4 py-3 rounded-lg bg-white border border-indigo-300';
    row.innerHTML = `
        <div class="edit-event-fields flex gap-2">
            <input type="text" id="edit-name-${i}" value="${name}" class="input-sm flex-1 px-3 py-1.5 border border-gray-300 rounded-lg">
            <input type="date" id="edit-date-${i}" value="${date}" class="input-sm w-auto px-3 py-1.5 border border-gray-300 rounded-lg">
        </div>
        <div class="edit-event-btns flex gap-2">
            <button onclick="saveEventEdit('${name}', ${i})" class="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">Save</button>
            <button onclick="loadEventList()" class="text-xs px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium">Cancel</button>
        </div>`;
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
    const { data, error } = await db.from('people').select('name, company, phone, email');
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
        .select('name, company, phone, email, event, timestamp')
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
            ${c.company ? `<div class="text-sm text-gray-600 mt-0.5">${c.company}</div>` : ''}
            <div class="text-sm text-gray-500 mt-1">${formatPhone(c.phone)} · ${c.email}</div>
            <div class="text-sm text-gray-400 mt-1">${c.event} · ${date.toLocaleDateString()} ${date.toLocaleTimeString()}</div>
        </div>`;
    }).join('');
}

// --- Export ---

async function exportCSV() {
    const eventFilter = document.getElementById('exportEvent').value;
    let query = db.from('checkins').select('name, company, phone, email, event, timestamp').order('timestamp');
    if (eventFilter) query = query.eq('event', eventFilter);

    const { data, error } = await query;
    if (error || !data || data.length === 0) { showNotification('No data to export.', 'info'); return; }

    const checkinsByEvent = {};
    data.forEach(c => {
        if (!checkinsByEvent[c.event]) checkinsByEvent[c.event] = [];
        checkinsByEvent[c.event].push(c);
    });

    Object.entries(checkinsByEvent).forEach(([eventName, eventCheckins]) => {
        const dateStr = new Date().toISOString().split('T')[0];
        const headers = ['Name', 'Company', 'Phone', 'Email', 'Event', 'Date', 'Time'];
        const rows = eventCheckins.map(c => {
            const date = new Date(c.timestamp);
            return [c.name, c.company || '', formatPhone(c.phone), c.email, c.event, date.toLocaleDateString(), date.toLocaleTimeString()];
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
    document.getElementById('mainContainer').classList.add('admin-wide');
    updateStats();
    loadExportEventSelect();
    loadBrandingList();
}

function closeAdmin() {
    document.getElementById('adminCard').classList.add('hidden');
    document.getElementById('adminLoginBtn').classList.remove('hidden');
    document.getElementById('checkinCard').classList.remove('hidden');
    document.getElementById('mainContainer').classList.remove('admin-wide');
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
                 data-name="${p.name}" data-company="${p.company || ''}" data-phone="${p.phone}" data-email="${p.email}" data-obfuscated="${obfuscateEmail(p.email)}">
                <div class="font-medium text-gray-800">${p.name}</div>
                <div class="text-sm text-gray-500">${p.company ? `${p.company} · ` : ''}${obfuscateEmail(p.email)}</div>
            </div>
        `).join('');

        suggestionsBox.classList.remove('hidden');

        suggestionsBox.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                const emailField = document.getElementById('email');
                const phoneField = document.getElementById('phone');
                const companyField = document.getElementById('company');
                nameInput.value = item.dataset.name;
                companyField.value = item.dataset.company;
                companyField.dataset.storedCompany = item.dataset.company;
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
        const companyField = document.getElementById('company');
        companyField.value = '';
        delete companyField.dataset.storedCompany;
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
