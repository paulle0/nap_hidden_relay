// js/views/relay-wire.js — Relay dashboard wiring and interaction logic
import { state, setState } from '../state.js';
import { STORAGE_KEY } from '../config.js';
import * as crypto from '../crypto.js';
import * as storage from '../storage.js';
import * as log from '../logger.js';
import { toast, escapeHtml, modal } from '../ui-utils.js';
import { startRelay, stopRelay, updateWhitelist } from '../relay-engine.js';

export function setStatusUI(statusState, text) {
  const banner = document.getElementById('statusBanner');
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  if (!banner) return;
  banner.className = 'status-banner';
  dot.className = 'status-dot';
  if (statusState === 'on') {
    banner.classList.add('status-banner--on');
    dot.classList.add('status-dot--active');
  } else if (statusState === 'error') {
    banner.classList.add('status-banner--err');
  } else {
    banner.classList.add('status-banner--off');
  }
  txt.textContent = text;
}

export function wireControls(root, sk) {
  root.querySelector('#btnStart').addEventListener('click', () => {
    startRelay(sk, state.relayUrls, state.whitelist, {
      onStatus: setStatusUI,
      onStoreUpdate: () => renderEventList(root),
    });
    setState({ running: true });
    root.querySelector('#btnStart').disabled = true;
    root.querySelector('#btnStop').disabled = false;
  });
  root.querySelector('#btnStop').addEventListener('click', () => {
    stopRelay();
    setState({ running: false });
    setStatusUI('off', 'Stopped');
    root.querySelector('#btnStart').disabled = false;
    root.querySelector('#btnStop').disabled = true;
  });
  root.querySelector('#btnClearEvents').addEventListener('click', async () => {
    const ok = await modal({
      title: 'Clear all events?',
      body: '<p>This deletes all stored events from IndexedDB.</p>',
      confirmText: 'Clear', confirmKind: 'danger',
    });
    if (!ok) return;
    await storage.clearEvents();
    renderEventList(root);
    log.ok('Cleared all events.');
  });
  wireEventExportImport(root);
}

export function wireWhitelist(root) {
  const addBtn = root.querySelector('#whitelistAdd');
  const input = root.querySelector('#whitelistInput');
  const doAdd = () => addWhitelistEntry(root, input);
  addBtn.addEventListener('click', doAdd);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
  renderWhitelistEntries(root);
}

function addWhitelistEntry(root, input) {
  let val = input.value.trim();
  if (!val) return;
  if (val.startsWith('npub1')) {
    try { val = crypto.npubDecode(val); } catch { toast('Invalid npub', 'error'); return; }
  }
  if (!/^[0-9a-f]{64}$/i.test(val)) { toast('Invalid pubkey', 'error'); return; }
  val = val.toLowerCase();
  if (state.whitelist.includes(val)) { toast('Already whitelisted', 'info'); return; }
  state.whitelist.push(val);
  localStorage.setItem(STORAGE_KEY.WHITELIST, JSON.stringify(state.whitelist));
  updateWhitelist(state.whitelist);
  input.value = '';
  renderWhitelistEntries(root);
  toast(`Whitelisted ${val.slice(0, 12)}…`, 'success');
}

function renderWhitelistEntries(root) {
  const container = root.querySelector('#whitelistEntries');
  if (state.whitelist.length === 0) {
    container.innerHTML = '<span class="chip-list__empty">No pubkeys whitelisted.</span>';
    return;
  }
  container.innerHTML = state.whitelist.map((pk, i) => {
    const npub = crypto.npubEncode(pk);
    return `<div class="whitelist-entry">
      <div class="whitelist-entry__keys">
        <span class="whitelist-entry__npub" title="${npub}">${npub}</span>
        <span class="whitelist-entry__hex" title="${pk}">${pk}</span>
      </div>
      <button class="chip__remove" data-idx="${i}">×</button>
    </div>`;
  }).join('');
  container.querySelectorAll('.chip__remove').forEach(btn => {
    btn.addEventListener('click', () => {
      state.whitelist.splice(parseInt(btn.dataset.idx), 1);
      localStorage.setItem(STORAGE_KEY.WHITELIST, JSON.stringify(state.whitelist));
      updateWhitelist(state.whitelist);
      renderWhitelistEntries(root);
    });
  });
}

export async function renderEventList(root) {
  const list = root.querySelector('#eventList');
  const count = root.querySelector('#eventCount');
  if (!list) return;
  const events = await storage.getAllEvents();
  count.textContent = `(${events.length})`;
  if (events.length === 0) {
    list.innerHTML = '<span class="chip-list__empty">No events stored.</span>';
    return;
  }
  list.innerHTML = events.slice(0, 50).map(ev => {
    const time = new Date(ev.created_at * 1000).toLocaleTimeString('en-GB', { hour12: false });
    return `<div class="event-row" title="${escapeHtml(JSON.stringify(ev))}">
      <span class="event-row__kind">kind:${ev.kind}</span>
      <span class="event-row__pubkey">${ev.pubkey?.slice(0, 16)}…</span>
      <span class="event-row__time">${time}</span>
      <span class="event-row__action">
        <button class="chip__remove" data-del="${ev.id}" title="Delete">×</button>
      </span>
    </div>`;
  }).join('');
  list.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await storage.deleteEvent(btn.dataset.del);
      renderEventList(root);
    });
  });
}

function wireEventExportImport(root) {
  root.querySelector('#btnExportEvents').addEventListener('click', async () => {
    const events = await storage.getAllEvents();
    if (events.length === 0) { toast('No events to export', 'info'); return; }
    const lines = events.map(ev => JSON.stringify(ev)).join('\n');
    const blob = new Blob([lines], { type: 'application/jsonl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nns-events-${Date.now()}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${events.length} event(s)`, 'success');
  });
  root.querySelector('#btnImportEvents').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      let imported = 0, skipped = 0;
      for (const line of lines) {
        try {
          const ev = JSON.parse(line);
          if (!ev.id || !ev.kind) { skipped++; continue; }
          await storage.putEvent(ev);
          imported++;
        } catch { skipped++; }
      }
      renderEventList(root);
      toast(`Imported ${imported} event(s)${skipped ? `, ${skipped} skipped` : ''}`, 'success');
      log.ok(`Imported ${imported} events from ${file.name}`);
    } catch (err) {
      toast('Import failed: ' + err.message, 'error');
      log.err('Import failed: ' + err.message);
    }
    e.target.value = '';
  });
}

export function appendLog(entry) {
  const area = document.getElementById('logArea');
  if (!area) return;
  if (!entry) { area.innerHTML = ''; return; }
  const line = document.createElement('div');
  line.className = `log--${entry.level}`;
  line.textContent = `[${entry.time}] ${entry.msg}`;
  area.appendChild(line);
  area.scrollTop = area.scrollHeight;
}
