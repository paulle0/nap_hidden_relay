// js/views/login.js — Login / import identity view
import { state, setState } from '../state.js';
import { DEFAULTS, STORAGE_KEY } from '../config.js';
import * as crypto from '../crypto.js';
import { toast, escapeHtml } from '../ui-utils.js';

let loginRelays = [];

export function renderLogin() {
  const root = document.getElementById('loginCard');
  loginRelays = [...DEFAULTS.rendezvousRelays];

  root.innerHTML = `
    <h2 class="card-title">Import your relay identity</h2>
    <p class="card-subtitle">Paste an existing secret key to give your hidden relay its identity.</p>
    <div class="field">
      <label>Relay secret key</label>
      <input id="loginNsec" class="input mono" type="text" placeholder="nsec1… or 64-char hex" autocomplete="off" />
      <p class="field-hint">Create a key pair e.g. at <a href="https://nak.nostr.com/" target="_blank" rel="noopener">nak.nostr.com</a> or in other nostr programs.</p>
    </div>
    <div class="field">
      <label>Rendezvous relays</label>
      <div id="loginRelayList"></div>
      <button class="relay-add" id="loginRelayAdd" type="button">+ add relay</button>
      <p class="field-hint">Public relays where your hidden relay listens for nrv messages.</p>
    </div>
    <button class="btn-primary" id="loginBtn" style="width:100%">Import &amp; start</button>`;

  renderRelays(root);
  wireEvents(root);
}

function renderRelays(root) {
  const list = root.querySelector('#loginRelayList');
  list.innerHTML = loginRelays.map((url) => relayRow(url)).join('');
  wireRelayRemove(list);
}

function relayRow(value = '') {
  return `<div class="relay-row">
    <input class="input" value="${escapeHtml(value)}" placeholder="wss://nos.lol" />
    <button class="relay-remove" type="button" title="Remove">×</button>
  </div>`;
}

function wireRelayRemove(list) {
  list.querySelectorAll('.relay-remove').forEach((btn, i) => {
    btn.addEventListener('click', () => {
      loginRelays.splice(i, 1);
      renderRelays(list.closest('.card'));
    });
  });
}

function wireEvents(root) {
  root.querySelector('#loginRelayAdd').addEventListener('click', () => {
    loginRelays.push('');
    renderRelays(root);
    const inputs = root.querySelectorAll('#loginRelayList .input');
    inputs[inputs.length - 1]?.focus();
  });

  root.querySelector('#loginBtn').addEventListener('click', () => doLogin(root));
  root.querySelector('#loginNsec').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLogin(root);
  });
}

function doLogin(root) {
  const val = root.querySelector('#loginNsec').value.trim();
  if (!val) { toast('Enter an nsec1… or 64-char hex secret key', 'error'); return; }

  let secretKey;
  if (val.startsWith('nsec1')) {
    try {
      secretKey = crypto.nsecDecode(val);
    } catch (e) {
      toast('Invalid nsec string', 'error');
      return;
    }
  } else if (/^[0-9a-f]{64}$/i.test(val)) {
    secretKey = crypto.hexToBytes(val);
  } else {
    toast('Enter a valid nsec1… or 64-character hex key', 'error');
    return;
  }

  // Read relay URLs from inputs
  const relays = [...root.querySelectorAll('#loginRelayList .input')]
    .map(i => i.value.trim())
    .filter(u => u.startsWith('wss://') || u.startsWith('ws://'));

  if (relays.length === 0) { toast('Add at least one relay', 'error'); return; }

  // Persist
  crypto.saveSecretKey(secretKey);
  localStorage.setItem(STORAGE_KEY.RELAY_URLS, JSON.stringify(relays));
  localStorage.setItem(STORAGE_KEY.LOGGED_IN, '1');

  setState({
    secretKey,
    relayUrls: relays,
    view: 'relay',
  });
  toast('Identity imported', 'success');
}
