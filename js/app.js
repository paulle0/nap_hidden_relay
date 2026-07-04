/**
 * NNS Hidden Relay — Application entry point
 */
import { DEFAULTS, STORAGE_KEY } from './config.js';
import * as crypto from './crypto.js';
import * as storage from './storage.js';
import * as log from './logger.js';
import { RelayConnection } from './relay-connection.js';
import { RelayHandler } from './relay-handler.js';
import { publishRelayList, publishRelayInfo } from './announcer.js';
import {
  el, setStatus, appendLog, renderEvents,
  renderWhitelist, setTheme, initModal,
} from './ui.js';

let connection = null;
let handler = null;
let secretKey = null;
let whitelist = [];

// ——— Initialization ——— //
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initKeys();
  initRelay();
  initWhitelist();
  initControls();
  initModal();
  log.onLog((entry) => appendLog(entry));
  renderEvents();
  log.info('NNS Hidden Relay ready.');
});

// ——— Theme ——— //
function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY.THEME) || 'dark';
  setTheme(saved);
  el.themeToggle.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark'
      ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem(STORAGE_KEY.THEME, next);
  });
}

// ——— Key management ——— //
function initKeys() {
  secretKey = crypto.loadSecretKey();
  if (secretKey) showPubkey();

  el.generateKeyBtn.addEventListener('click', () => {
    if (secretKey && !confirm('This will replace your current relay identity. Continue?')) {
      return;
    }
    secretKey = crypto.generateSecretKey();
    crypto.saveSecretKey(secretKey);
    showPubkey();
    log.ok('New relay identity generated.');
  });
}

function showPubkey() {
  const pk = crypto.getPublicKey(secretKey);
  el.pubkeyDisplay.textContent = pk;
  el.pubkeyDisplay.title = pk;
}

// ——— Relay URL ——— //
function initRelay() {
  const saved = localStorage.getItem(STORAGE_KEY.RELAY_URL) || DEFAULTS.rendezvousRelay;
  el.relayUrl.value = saved;
  el.relayUrl.addEventListener('change', () => {
    localStorage.setItem(STORAGE_KEY.RELAY_URL, el.relayUrl.value.trim());
  });
}

// ——— Whitelist ——— //
function initWhitelist() {
  const saved = localStorage.getItem(STORAGE_KEY.WHITELIST);
  whitelist = saved ? JSON.parse(saved) : [];
  renderWhitelist(whitelist, removeFromWhitelist);

  el.whitelistAdd.addEventListener('click', addToWhitelist);
  el.whitelistInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addToWhitelist();
  });
}

function addToWhitelist() {
  const val = el.whitelistInput.value.trim();
  if (!val || !/^[0-9a-f]{64}$/i.test(val)) {
    log.err('Invalid pubkey. Must be 64-char hex.');
    return;
  }
  if (whitelist.includes(val)) return;
  whitelist.push(val);
  saveWhitelist();
  el.whitelistInput.value = '';
}

function removeFromWhitelist(pk) {
  whitelist = whitelist.filter(p => p !== pk);
  saveWhitelist();
}

function saveWhitelist() {
  localStorage.setItem(STORAGE_KEY.WHITELIST, JSON.stringify(whitelist));
  renderWhitelist(whitelist, removeFromWhitelist);
  if (handler) handler.setWhitelist(whitelist);
}

// ——— Start / Stop ——— //
function initControls() {
  el.startBtn.addEventListener('click', startRelay);
  el.stopBtn.addEventListener('click', stopRelay);
  el.clearEventsBtn.addEventListener('click', async () => {
    if (!confirm('Delete all stored events?')) return;
    await storage.clearEvents();
    renderEvents();
    log.info('All events cleared.');
  });
  setStatus('off', 'Stopped');
}

function startRelay() {
  if (!secretKey) {
    log.err('Generate a relay identity first.');
    return;
  }
  const url = el.relayUrl.value.trim();
  if (!url) {
    log.err('Enter a rendezvous relay URL.');
    return;
  }

  const pubkey = crypto.getPublicKey(secretKey);
  connection = new RelayConnection(url);
  handler = new RelayHandler(
    secretKey,
    (event) => connection.publish(event),
    () => renderEvents(),
  );
  handler.setWhitelist(whitelist);

  connection.onEvent((event) => handler.handleEvent(event));
  connection.onStatus((status) => {
    switch (status) {
      case 'connecting':
        setStatus('off', 'Connecting…');
        break;
      case 'open':
        setStatus('on', 'Running');
        el.startBtn.disabled = true;
        el.stopBtn.disabled = false;
        // Announce this relay on the rendezvous relay (NNS NIP §10112/10113)
        publishRelayList(secretKey, url, (ev) => connection.publish(ev));
        publishRelayInfo(secretKey, (ev) => connection.publish(ev));
        break;
      case 'closed':
      case 'error':
        setStatus(status === 'error' ? 'error' : 'off',
          status === 'error' ? 'Error' : 'Disconnected');
        break;
    }
  });

  connection.connect(pubkey);
}

function stopRelay() {
  if (connection) {
    connection.disconnect();
    connection = null;
    handler = null;
  }
  setStatus('off', 'Stopped');
  el.startBtn.disabled = false;
  el.stopBtn.disabled = true;
  log.info('Relay stopped.');
}
