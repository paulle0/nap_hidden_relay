// js/views/relay.js — Relay dashboard: template rendering
import { state, subscribe } from '../state.js';
import * as crypto from '../crypto.js';
import * as log from '../logger.js';
import { escapeHtml, attachCopy } from '../ui-utils.js';
import { nrvrelayEncode, nrvUriEncode } from '../nrv-format.js';
import { isRunning } from '../relay-engine.js';
import { wireControls, wireWhitelist, renderWhitelistEntries, renderEventList, appendLog } from './relay-wire.js';

let _unsubKeyring = null;

export async function renderRelay() {
  const root = document.getElementById('relayContent');
  const sk = state.secretKey;
  if (!sk) return;

  const pk = crypto.getPublicKey(sk);
  const npub = crypto.npubEncode(pk);
  let nrvrelay = '—';
  let nrvUri = '—';
  try { nrvrelay = nrvrelayEncode(pk, state.relayUrls); } catch {}
  try { nrvUri = nrvUriEncode(pk, state.relayUrls); } catch {}

  root.innerHTML = `
    ${renderIdentityCard(npub, nrvrelay, nrvUri)}
    ${renderControlsCard()}
    ${renderWhitelistCard()}
    ${renderEventsCard()}
    ${renderLogCard()}`;

  wireControls(root, sk);
  wireWhitelist(root);
  attachCopy(root);
  renderEventList(root);
  log.onLog((entry) => appendLog(entry));

  // Re-render whitelist when keyring subkeys update
  if (_unsubKeyring) _unsubKeyring();
  let prevSubkeys = state.keyringSubkeys;
  _unsubKeyring = subscribe((s) => {
    if (s.keyringSubkeys !== prevSubkeys) {
      prevSubkeys = s.keyringSubkeys;
      renderWhitelistEntries(root);
    }
  });
}

function renderIdentityCard(npub, nrvrelay, nrvUri) {
  return `
    <div class="card" style="margin-bottom:var(--space-5)">
      <div class="section-label">Relay Identity</div>
      <div class="field">
        <label>npub</label>
        <div class="identity-value" title="${escapeHtml(npub)}">${escapeHtml(npub)}</div>
      </div>
      ${identityRow('nrvrelay', nrvrelay, 'Share this to hand someone your relay address.')}
      ${identityRow('nostr+nrv://', nrvUri, 'Put this in an r-tag of your relay list (kind:10002) to point clients here.')}
    </div>`;
}

function identityRow(label, value, hint) {
  const safe = escapeHtml(value);
  return `
    <div class="field">
      <label>${escapeHtml(label)}</label>
      <div class="copy-row">
        <div class="identity-value" style="flex:1" title="${safe}">${safe}</div>
        <button class="copy-btn" data-copy="${safe}">Copy</button>
      </div>
      <p class="field-hint">${escapeHtml(hint)}</p>
    </div>`;
}

function renderControlsCard() {
  const running = isRunning();
  return `
    <div class="card" style="margin-bottom:var(--space-5)">
      <div class="section-label">Relay Control</div>
      <div id="statusBanner" class="status-banner status-banner--off">
        <div id="statusDot" class="status-dot"></div>
        <span id="statusText">Stopped</span>
      </div>
      <div class="relay-controls">
        <button class="btn-primary" id="btnStart" ${running ? 'disabled' : ''}>Start relay</button>
        <button class="btn-secondary" id="btnStop" ${running ? '' : 'disabled'}>Stop relay</button>
      </div>
    </div>`;
}

function renderWhitelistCard() {
  return `
    <div class="card" style="margin-bottom:var(--space-5)">
      <div class="section-label">Relay Whitelist</div>
      <p style="color:var(--text-dim);font-size:0.88rem;margin:0 0 var(--space-3)">
        Only whitelisted pubkeys can send messages to this relay.
      </p>
      <div class="field">
        <div style="display:flex;gap:var(--space-2)">
          <input id="whitelistInput" class="input mono" placeholder="npub1… or hex pubkey" style="flex:1" />
          <button class="btn-secondary" id="whitelistAdd">Add</button>
        </div>
      </div>
      <div id="whitelistEntries"></div>
    </div>`;
}

function renderEventsCard() {
  return `
    <div class="card" style="margin-bottom:var(--space-5)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-3)">
        <div class="section-label" style="margin:0">Relay Stored Events <span id="eventCount"></span></div>
        <div class="events-toolbar">
          <button class="btn-ghost" id="btnExportEvents" style="padding:6px 12px;font-size:0.78rem" title="Download as .jsonl">↓ Export</button>
          <label class="btn-ghost events-import-label" style="padding:6px 12px;font-size:0.78rem" title="Import from .jsonl">
            ↑ Import
            <input type="file" id="btnImportEvents" accept=".jsonl" hidden />
          </label>
          <button class="btn-danger" id="btnClearEvents" style="padding:6px 12px;font-size:0.78rem">Clear all</button>
        </div>
      </div>
      <div class="event-list" id="eventList"></div>
    </div>`;
}

function renderLogCard() {
  return `
    <div class="card">
      <div class="section-label">Relay Log</div>
      <div class="log-area" id="logArea"></div>
    </div>`;
}
