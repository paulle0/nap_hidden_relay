// js/views/settings.js — Settings: relay URLs, identity, wipe
import { state, setState } from '../state.js';
import { STORAGE_KEY } from '../config.js';
import * as crypto from '../crypto.js';
import { toast, escapeHtml, modal, copy, attachCopy } from '../ui-utils.js';
import { stopRelay } from '../relay-engine.js';

export function renderSettings() {
  const root = document.getElementById('settingsCard');
  const sk = state.secretKey;
  if (!sk) return;

  root.innerHTML = `
    ${renderRelaysSection()}
    ${renderIdentitySection()}
    ${renderWipeSection()}`;

  wireRelays(root);
  wireIdentity(root);
  wireWipe(root);
}

function renderRelaysSection() {
  return `
    <div class="settings-section">
      <h4>Rendezvous relays</h4>
      <p>Public relays where this hidden relay listens for incoming nns messages.</p>
      <div id="settingsRelayList">
        ${state.relayUrls.map(url => relayRow(url)).join('')}
      </div>
      <div style="display:flex;gap:var(--space-2);margin-top:var(--space-3)">
        <button class="relay-add" id="settingsRelayAdd" type="button">+ add relay</button>
        <button class="btn-primary" id="saveRelaysBtn" style="margin-left:auto">Save relays</button>
      </div>
    </div>`;
}

function renderIdentitySection() {
  return `
    <div class="settings-section">
      <h4>Relay identity</h4>
      <p>Your relay's secret key. Keep this safe and never share it.</p>
      <div id="nsecContainer">
        <button class="btn-secondary" id="revealNsecBtn">Reveal &amp; copy nsec</button>
      </div>
    </div>`;
}

function renderWipeSection() {
  return `
    <div class="settings-section">
      <h4>Log out</h4>
      <p>Removes your identity from this browser. The relay will stop.</p>
      <button class="btn-danger" id="logoutBtn">Log out &amp; wipe</button>
    </div>`;
}

function relayRow(value = '') {
  return `<div class="relay-row">
    <input class="input" value="${escapeHtml(value)}" placeholder="wss://nos.lol" />
    <button class="relay-remove" type="button" title="Remove">×</button>
  </div>`;
}

function wireRelays(root) {
  root.querySelector('#settingsRelayList').addEventListener('click', (e) => {
    if (e.target.classList.contains('relay-remove')) {
      e.target.closest('.relay-row').remove();
    }
  });
  root.querySelector('#settingsRelayAdd').addEventListener('click', () => {
    root.querySelector('#settingsRelayList').insertAdjacentHTML('beforeend', relayRow());
  });
  root.querySelector('#saveRelaysBtn').addEventListener('click', () => {
    const relays = [...root.querySelectorAll('#settingsRelayList .input')]
      .map(i => i.value.trim())
      .filter(u => u.startsWith('wss://') || u.startsWith('ws://'));
    if (relays.length === 0) { toast('Keep at least one relay', 'error'); return; }
    localStorage.setItem(STORAGE_KEY.RELAY_URLS, JSON.stringify(relays));
    setState({ relayUrls: relays });
    toast('Relays saved. Restart the relay to apply.', 'success');
  });
}

function wireIdentity(root) {
  const btn = root.querySelector('#revealNsecBtn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const ok = await modal({
      title: 'Reveal relay nsec?',
      body: '<p>Your relay secret key will be shown on screen.</p>',
      confirmText: 'Reveal', confirmKind: 'primary',
    });
    if (!ok) return;
    const nsec = crypto.nsecEncode(state.secretKey);
    const container = root.querySelector('#nsecContainer');
    container.innerHTML = `
      <div class="copy-row">
        <input class="input mono" type="password" value="${escapeHtml(nsec)}" readonly id="nsecInput" />
        <button class="copy-btn" data-copy="${escapeHtml(nsec)}">Copy</button>
        <button class="btn-ghost" id="toggleNsecVis" title="Show / hide" style="padding:0 12px">👁</button>
      </div>
      <p class="field-hint">Handle with extreme care.</p>`;
    attachCopy(container);
    container.querySelector('#toggleNsecVis').addEventListener('click', () => {
      const inp = container.querySelector('#nsecInput');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
  });
}

function wireWipe(root) {
  root.querySelector('#logoutBtn').addEventListener('click', async () => {
    const ok = await modal({
      title: 'Log out and wipe?',
      body: '<p>This removes your identity from this browser. Stored events will be deleted.</p>',
      confirmText: 'Wipe everything', confirmKind: 'danger',
    });
    if (!ok) return;
    stopRelay();
    crypto.clearSecretKey();
    localStorage.removeItem(STORAGE_KEY.LOGGED_IN);
    localStorage.removeItem(STORAGE_KEY.RELAY_URLS);
    localStorage.removeItem(STORAGE_KEY.WHITELIST);
    toast('Vault wiped', 'info');
    setTimeout(() => location.reload(), 800);
  });
}
