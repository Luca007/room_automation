// app.js
// UI + lógica de autenticação + Firestore realtime

import { auth, googleProvider, db } from './firebase.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import {
  doc,
  collection,
  onSnapshot,
  getDoc,
  setDoc,
  serverTimestamp,
  runTransaction
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

// ================= Helper UI =================
const qs = (s, el = document) => el.querySelector(s);
const qsa = (s, el = document) => [...el.querySelectorAll(s)];

function toast(message, opts = {}) {
  const { type = 'info', title } = opts;
  const container = qs('#toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `\n    ${title ? `<h4>${title}</h4>` : ''}\n    <div>${message}</div>\n    <button aria-label="Fechar" class="toast-close">✕</button>\n  `;
  container.appendChild(el);
  const remove = () => el.remove();
  el.querySelector('.toast-close').addEventListener('click', remove);
  setTimeout(remove, 6000);
}

function formatDate(ts) {
  if (!ts) return '—';
  try {
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString('pt-BR', { hour12: false });
  } catch { return '—'; }
}

function relative(date) {
  if (!date) return '—';
  const d = date.toDate ? date.toDate() : date;
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`; const m = Math.floor(s / 60); if (m < 60) return `${m}m`; const h = Math.floor(m / 60); if (h < 24) return `${h}h`; const day = Math.floor(h / 24); return `${day}d`;
}

function setView(authenticated) {
  qs('#auth-view').classList.toggle('active', !authenticated);
  qs('#main-view').classList.toggle('active', authenticated);
}

// ================= Auth =================
const authForm = qs('#auth-form');
const authError = qs('#auth-error');
const tabs = qsa('.tab');
let mode = 'login';

tabs.forEach(btn => btn.addEventListener('click', () => {
  mode = btn.dataset.mode;
  tabs.forEach(t => t.classList.toggle('active', t === btn));
  tabs.forEach(t => t.setAttribute('aria-selected', t === btn));
  qs('#submit-auth').textContent = mode === 'login' ? 'Entrar' : 'Registrar';
  authError.textContent = '';
}));

authForm.addEventListener('submit', async e => {
  e.preventDefault();
  authError.textContent = '';
  const email = qs('#email').value.trim();
  const password = qs('#password').value;
  try {
    if (mode === 'login') {
      await signInWithEmailAndPassword(auth, email, password);
      toast('Login efetuado', { type: 'success' });
    } else {
      await createUserWithEmailAndPassword(auth, email, password);
      toast('Usuário criado', { type: 'success' });
    }
  } catch (err) {
    authError.textContent = traduzErro(err.code || err.message);
  }
});

qs('#google-auth').addEventListener('click', async () => {
  authError.textContent = '';
  try {
    await signInWithPopup(auth, googleProvider);
    toast('Login com Google', { type: 'success' });
  } catch (err) {
    authError.textContent = traduzErro(err.code || err.message);
  }
});

qs('#logout-btn').addEventListener('click', () => signOut(auth));

function traduzErro(code) {
  const map = {
    'auth/invalid-credential': 'Credenciais inválidas',
    'auth/user-not-found': 'Usuário não encontrado',
    'auth/wrong-password': 'Senha incorreta',
    'auth/email-already-in-use': 'Email já cadastrado',
    'auth/weak-password': 'Senha fraca (mín. 6 chars)',
    'auth/popup-closed-by-user': 'Popup fechado',
    'auth/network-request-failed': 'Falha de rede' 
  };
  return map[code] || code;
}

// ================= Devices =================
const devicesGrid = qs('#devices-grid');
const emptyHint = qs('#empty-hint');
let unsubscribeDevices = null;
let deviceUnsubMap = new Map();

function clearDevices() {
  devicesGrid.innerHTML = '';
  deviceUnsubMap.forEach(unsub => unsub());
  deviceUnsubMap.clear();
}

function renderDeviceCard(id) {
  const card = document.createElement('div');
  card.className = 'device-card';
  card.dataset.id = id;
  card.innerHTML = `\n    <div class="device-header">\n      <span class="device-name">${id.replace(/_/g,' ')}</span>\n      <span class="status-pill off" data-status>OFF</span>\n    </div>\n    <div class="switch-wrapper">\n      <div class="toggle" role="switch" aria-checked="false" tabindex="0" data-toggle>\n        <div class="toggle-knob">ON</div>\n      </div>\n      <div class="seq-badge" data-seq>SEQ <strong>—</strong></div>\n    </div>\n    <div class="inline-meta" data-meta>\n      <span>Atualizado <strong data-updated>—</strong></span><span class="dot"></span>\n      <span>Fonte <strong data-source>—</strong></span><span class="dot"></span>\n      <span>By <strong data-by>—</strong></span>\n    </div>\n    <div class="actions-row">\n      <button class="refresh-btn" data-refresh>⟳ Sync</button>\n      <span class="latency-indicator" data-latency>lat —</span>\n    </div>\n  `;
  devicesGrid.appendChild(card);
  attachDeviceEvents(card, id);
  return card;
}

function attachDeviceEvents(card, id) {
  const toggle = card.querySelector('[data-toggle]');
  const refreshBtn = card.querySelector('[data-refresh]');

  const applyToggle = async () => {
    try {
      toggle.classList.add('busy');
      await toggleDesiredOn(id, !(toggle.classList.contains('on')));
    } catch (err) {
      toast('Falha ao atualizar', { type: 'error' });
      console.error(err);
    } finally {
      toggle.classList.remove('busy');
    }
  };

  toggle.addEventListener('click', applyToggle);
  toggle.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); applyToggle(); }
  });

  refreshBtn.addEventListener('click', () => manualRefresh(id));
}

async function manualRefresh(id) {
  try {
    const reportedRef = doc(db, 'devices', id, 'shadow', 'reported');
    const snap = await getDoc(reportedRef);
    if (snap.exists()) {
      toast('Estado (reported) sincronizado', { type: 'success' });
    } else {
      toast('Ainda sem reported', { type: 'warning' });
    }
  } catch (err) {
    toast('Erro ao consultar', { type: 'error' });
  }
}

async function toggleDesiredOn(id, value) {
  const desiredRef = doc(db, 'devices', id, 'shadow', 'desired');
  const seqInc = Math.floor(Date.now() / 1000); // simplificado
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(desiredRef);
    let seq = seqInc;
    if (snap.exists()) {
      const data = snap.data();
      if (typeof data.seq === 'number') seq = data.seq + 1;
    }
    tx.set(desiredRef, {
      on: value,
      seq,
      updatedAt: serverTimestamp(),
      updatedBy: { source: 'web', uid: auth.currentUser?.uid || 'web' },
      source: 'web',
      uid: auth.currentUser?.uid || 'web'
    }, { merge: true });
  });
  toast(`Luz ${value ? 'ligada' : 'desligada'} (desired)`, { type: 'success' });
}

function subscribeDevice(id) {
  const desiredRef = doc(db, 'devices', id, 'shadow', 'desired');
  const reportedRef = doc(db, 'devices', id, 'shadow', 'reported');
  const ensure = () => qs(`.device-card[data-id="${id}"]`) || renderDeviceCard(id);
  let lastDesiredTs = null;
  let lastReportedTs = null;

  const unsubDesired = onSnapshot(desiredRef, snap => {
    const card = ensure();
    const data = snap.data() || {};
    updateCardDesired(card, data);
    lastDesiredTs = data.updatedAt || null;
    updateLatency(card, lastDesiredTs, lastReportedTs);
  });
  const unsubReported = onSnapshot(reportedRef, snap => {
    const card = ensure();
    const data = snap.data() || {};
    updateCardReported(card, data);
    lastReportedTs = data.updatedAt || null;
    updateLatency(card, lastDesiredTs, lastReportedTs);
  });

  deviceUnsubMap.set(id, () => { unsubDesired(); unsubReported(); });
}

function updateLatency(card, desiredTs, reportedTs) {
  const el = card.querySelector('[data-latency]');
  if (!desiredTs || !reportedTs) { el.textContent = 'lat —'; el.className = 'latency-indicator'; return; }
  try {
    const d = desiredTs.toDate ? desiredTs.toDate() : new Date(desiredTs);
    const r = reportedTs.toDate ? reportedTs.toDate() : new Date(reportedTs);
    const diff = Math.abs(r - d);
    const ms = diff; // ambos são Date
    const cls = ms < 4000 ? 'ok' : ms < 15000 ? 'slow' : '';
    el.className = `latency-indicator ${cls}`;
    el.textContent = `lat ${(ms/1000).toFixed(1)}s`;
  } catch {
    el.textContent = 'lat —';
  }
}

function updateCardDesired(card, data) {
  const toggle = card.querySelector('[data-toggle]');
  const status = card.querySelector('[data-status]');
  const seq = card.querySelector('[data-seq] strong');
  const updatedEl = card.querySelector('[data-updated]');
  const sourceEl = card.querySelector('[data-source]');

  if (typeof data.on === 'boolean') {
    toggle.classList.toggle('on', data.on);
    toggle.setAttribute('aria-checked', data.on);
    status.textContent = data.on ? 'ON' : 'OFF';
    status.classList.toggle('on', data.on); status.classList.toggle('off', !data.on);
  }
  if (typeof data.seq !== 'undefined') seq.textContent = data.seq;
  if (data.updatedAt) updatedEl.textContent = relative(data.updatedAt);
  if (data.source) sourceEl.textContent = data.source;
}

function updateCardReported(card, data) {
  const byEl = card.querySelector('[data-by]');
  if (data.by) byEl.textContent = data.by;
  // poderia mostrar reason futuramente
}

// Para futura expansão: listar dinamicamente dispositivos consultando collection 'devices'
// Aqui, assumimos que já existe 'luz_do_quarto'
const knownDevices = ['luz_do_quarto'];

function initDevices() {
  clearDevices();
  if (!knownDevices.length) { emptyHint.classList.remove('hidden'); return; }
  emptyHint.classList.add('hidden');
  knownDevices.forEach(id => { renderDeviceCard(id); subscribeDevice(id); });
}

// ================= Auth State Listener =================
onAuthStateChanged(auth, user => {
  if (user) {
    qs('#user-email').textContent = user.email || user.uid;
    setView(true);
    initDevices();
  } else {
    setView(false);
    clearDevices();
  }
});

// A cada minuto atualizar timers relativos
setInterval(() => {
  qsa('[data-updated]').forEach(el => {
    const card = el.closest('.device-card');
    if (!card) return;
    // Não temos a data original explícita armazenada aqui, simples: ignora
  });
}, 60_000);

// Para manter a UI consistente podemos observar mudanças de foco/visibilidade
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // futuro: revalidar estados
  }
});
