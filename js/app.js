/* =========================================================
   AUWC Fellowship — Ministry Team Registration
   (needs js/config.js to be loaded first)
   ========================================================= */
'use strict';

let currentTeamId = null;

/* ---------- Storage ---------- */
function getRegistrations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('Could not read storage', e);
    return [];
  }
}
function setRegistrations(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch (e) {
    console.error('Could not save', e);
    return false;
  }
}

/* ---------- Helpers ---------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function teamById(id) { return TEAMS.find(t => t.id === id); }
function uid() {
  return (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}
function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
         ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
function showMessage(el, text, type) {
  el.textContent = text;
  el.className = 'message show ' + type;
}
function hideMessage(el) {
  el.className = 'message';
  el.textContent = '';
}
let toastTimer;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------- Views ---------- */
function showView(name) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === name));
  $('#hero').hidden = (name === 'dashboard');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- Logo fallback ----------
   If images/logo.png is missing, the logo circles show "FOCUS" text. */
function setupLogoFallback() {
  $$('.logo img').forEach(img => {
    const fail = () => { img.remove(); };
    img.addEventListener('error', fail);
    if (img.complete && img.naturalWidth === 0) fail();
  });
}

/* ---------- Team photos ----------
   "path" can be a full file name (images/photo_1.jpg) or a name
   without extension (images/love) — then .jpg/.jpeg/.png/.webp are tried.
   onOk()   is called when the photo loads.
   onFail() is called when no photo file can be found. */
function loadTeamPhoto(img, path, onFail, onOk) {
  const hasExt = /\.(jpe?g|png|webp|gif)$/i.test(path);
  const candidates = hasExt
    ? [path]
    : PHOTO_EXTENSIONS.map(ext => path + '.' + ext);

  let i = 0;
  const tryNext = () => {
    if (i >= candidates.length) {
      img.onerror = null;
      img.onload = null;
      onFail();
      return;
    }
    // encodeURI makes names with spaces or brackets work
    img.src = encodeURI(candidates[i++]);
  };
  img.onload  = () => { if (onOk) onOk(); };
  img.onerror = tryNext;
  tryNext();
}

/* ---------- Build dynamic UI ---------- */
function buildTeamPicker() {
  const picker = $('#teamPicker');
  picker.innerHTML = '';
  TEAMS.forEach(t => {
    const label = document.createElement('label');
    label.className = 'team-card';
    label.innerHTML = `
      <input type="checkbox" name="team" value="${esc(t.id)}">
      <span class="team-photo">
        <img alt="">
        <span class="team-icon" aria-hidden="true">${t.icon}</span>
      </span>
      <span class="team-name">${esc(t.name)}</span>`;
    picker.appendChild(label);

    // Show the photo; the emoji stays only if no photo file is found
    const box = label.querySelector('.team-photo');
    const img = box.querySelector('img');
    loadTeamPhoto(
      img,
      t.photo,
      () => img.remove(),
      () => box.classList.add('has-photo')
    );
  });
  picker.addEventListener('change', () => {
    $$('.team-card', picker).forEach(card => {
      card.classList.toggle('selected', card.querySelector('input').checked);
    });
  });
}
function buildBatchSelect() {
  const select = $('#batch');
  BATCHES.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b;
    opt.textContent = 'Batch ' + b;
    select.appendChild(opt);
  });
}
function buildLoginSelect() {
  const select = $('#loginTeam');
  TEAMS.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    select.appendChild(opt);
  });
}

/* ---------- Registration ---------- */
function handleRegister(e) {
  e.preventDefault();

  const msg        = $('#formMessage');
  const name       = $('#fullName').value.trim();
  const department = $('#department').value.trim();
  const batch      = $('#batch').value;
  const phone      = $('#phone').value.trim();
  const teamIds    = $$('input[name="team"]:checked').map(i => i.value);

  hideMessage(msg);

  if (!name || !department || !batch || !phone) {
    showMessage(msg, '⚠️ Please fill in every field.', 'error');
    return;
  }
  if (teamIds.length < MIN_TEAMS) {
    showMessage(msg, '⚠️ Please choose at least one team.', 'error');
    return;
  }
  if (name.length < 3) {
    showMessage(msg, '⚠️ Please enter your full name.', 'error');
    return;
  }
  if (!/^[0-9+\-\s()]{7,15}$/.test(phone)) {
    showMessage(msg, '⚠️ Please enter a valid telephone number.', 'error');
    return;
  }

  const regs = getRegistrations();

  // A person may join many teams, but only once per team.
  const samePerson = r =>
    r.name.toLowerCase() === name.toLowerCase() &&
    r.phone.replace(/\D/g, '') === phone.replace(/\D/g, '');

  const alreadyIn = teamIds.filter(id => regs.some(r => samePerson(r) && r.team === id));
  const newTeams  = teamIds.filter(id => !alreadyIn.includes(id));

  if (newTeams.length === 0) {
    const names = alreadyIn.map(id => teamById(id).name).join(', ');
    showMessage(msg, `⚠️ ${name} is already registered in: ${names}.`, 'error');
    return;
  }

  const now = new Date().toISOString();
  newTeams.forEach(id => {
    regs.push({
      id: uid(),
      name,
      department,
      batch: Number(batch),
      phone,
      team: id,
      createdAt: now
    });
  });

  if (!setRegistrations(regs)) {
    showMessage(msg, '⛔ Could not save on this device. Please turn off private browsing and try again.', 'error');
    return;
  }

  const joined = newTeams.map(id => teamById(id).name).join(', ');
  let text = `✅ Thank you ${name}! You have successfully joined: ${joined}.`;
  if (alreadyIn.length) {
    text += ` (Already a member of: ${alreadyIn.map(id => teamById(id).name).join(', ')}.)`;
  }
  showMessage(msg, text, 'success');
  toast('Registration saved 🎉');

  $('#registerForm').reset();
  $$('.team-card').forEach(c => c.classList.remove('selected'));
}

/* ---------- Login ---------- */
function handleLogin(e) {
  e.preventDefault();

  const msg    = $('#loginMessage');
  const teamId = $('#loginTeam').value;
  const pass   = $('#loginPass').value;

  hideMessage(msg);

  if (!teamId) { showMessage(msg, '⚠️ Please select your team.', 'error'); return; }
  if (!pass)   { showMessage(msg, '⚠️ Please enter the team password.', 'error'); return; }
  if (TEAM_PASSWORDS[teamId] !== pass) {
    showMessage(msg, '⛔ Wrong password for that team. Please try again.', 'error');
    return;
  }

  currentTeamId = teamId;
  $('#loginPass').value = '';
  openDashboard();
}

/* ---------- Dashboard ---------- */
function openDashboard() {
  const team = teamById(currentTeamId);
  if (!team) { showView('login'); return; }

  $('#dashTitle').textContent = team.name;
  const banner = $('#dashPhoto');
  banner.hidden = false;
  loadTeamPhoto(banner, team.photo, () => { banner.hidden = true; });
  $('#dashSub').textContent   = 'Only registrations for the ' + team.name + ' are shown here.';
  $('#searchInput').value     = '';

  renderDashboard();
  showView('dashboard');
}

function getTeamRegistrations() {
  return getRegistrations()
    .filter(r => r.team === currentTeamId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
function getFilteredRegistrations() {
  const all = getTeamRegistrations();
  const q = $('#searchInput').value.trim().toLowerCase();
  if (!q) return all;
  return all.filter(r =>
    r.name.toLowerCase().includes(q) ||
    r.department.toLowerCase().includes(q) ||
    r.phone.toLowerCase().includes(q) ||
    String(r.batch).includes(q)
  );
}

function renderDashboard() {
  const all      = getTeamRegistrations();
  const filtered = getFilteredRegistrations();
  const emptyMsg = $('#emptyMsg');

  $('#stats').innerHTML = `
    <div class="stat"><span class="stat-num">${all.length}</span><span class="stat-label">Total Members</span></div>
    ${BATCHES.map(b => `
      <div class="stat">
        <span class="stat-num">${all.filter(r => r.batch === b).length}</span>
        <span class="stat-label">Batch ${b}</span>
      </div>`).join('')}`;

  $('#dashBody').innerHTML = filtered.map((r, i) => `
    <tr>
      <td class="col-no">${i + 1}</td>
      <td class="col-name"><strong>${esc(r.name)}</strong></td>
      <td data-label="Department">${esc(r.department)}</td>
      <td data-label="Batch">Batch ${esc(r.batch)}</td>
      <td data-label="Phone"><a href="tel:${esc(r.phone.replace(/[^0-9+]/g, ''))}">${esc(r.phone)}</a></td>
      <td data-label="Registered">${esc(formatDate(r.createdAt))}</td>
      <td class="col-act">
        <button class="btn danger small" data-del="${esc(r.id)}" type="button">Remove</button>
      </td>
    </tr>`).join('');

  if (filtered.length === 0) {
    emptyMsg.hidden = false;
    emptyMsg.textContent = all.length === 0
      ? 'No registrations yet for this team.'
      : 'No results match your search.';
  } else {
    emptyMsg.hidden = true;
  }
}

function handleDelete(e) {
  const btn = e.target.closest('button[data-del]');
  if (!btn) return;
  const id = btn.dataset.del;
  const record = getRegistrations().find(r => r.id === id);
  if (!record) return;
  if (!confirm(`Remove "${record.name}" from ${teamById(record.team).name}?`)) return;
  setRegistrations(getRegistrations().filter(r => r.id !== id));
  renderDashboard();
  toast('Member removed');
}

function exportCSV() {
  const rows = getFilteredRegistrations();
  if (rows.length === 0) { alert('There is nothing to export.'); return; }

  const team = teamById(currentTeamId);
  const header = ['No', 'Full Name', 'Department', 'Batch', 'Telephone', 'Team', 'Registered At'];
  const lines = [header.join(',')];
  rows.forEach((r, i) => {
    lines.push([
      i + 1, r.name, r.department, 'Batch ' + r.batch, r.phone, team.name, formatDate(r.createdAt)
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  });

  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `AUWC_${team.id}_team_members.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------- Events ---------- */
function bindEvents() {
  $$('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.nav));
  });
  $('#registerForm').addEventListener('submit', handleRegister);
  $('#loginForm').addEventListener('submit', handleLogin);
  $('#searchInput').addEventListener('input', renderDashboard);
  $('#dashBody').addEventListener('click', handleDelete);
  $('#exportBtn').addEventListener('click', exportCSV);
  $('#logoutBtn').addEventListener('click', () => {
    currentTeamId = null;
    showView('login');
  });
  $('#year').textContent = new Date().getFullYear();
}

/* ---------- Init ---------- */
(function init() {
  buildTeamPicker();
  buildBatchSelect();
  buildLoginSelect();
  bindEvents();
  setupLogoFallback();
  showView('register');
})();