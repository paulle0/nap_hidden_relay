/**
 * NNS Hidden Relay — UI helpers
 */
import * as storage from './storage.js';
import * as log from './logger.js';

// ——— DOM references ——— //
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

export const el = {
  get relayUrl()      { return $('#relay-url'); },
  get pubkeyDisplay() { return $('#pubkey-display'); },
  get startBtn()      { return $('#btn-start'); },
  get stopBtn()       { return $('#btn-stop'); },
  get statusBanner()  { return $('#status-banner'); },
  get statusText()    { return $('#status-text'); },
  get statusDot()     { return $('#status-dot'); },
  get logArea()       { return $('#log-area'); },
  get eventList()     { return $('#event-list'); },
  get eventCount()    { return $('#event-count'); },
  get whitelistInput(){ return $('#whitelist-input'); },
  get whitelistAdd()  { return $('#whitelist-add'); },
  get chipList()      { return $('#chip-list'); },
  get clearEventsBtn(){ return $('#btn-clear-events'); },
  get themeToggle()   { return $('#theme-toggle'); },
  get modal()         { return $('#modal-backdrop'); },
  get modalBody()     { return $('#modal-body'); },
  get modalClose()    { return $('#modal-close'); },
  get generateKeyBtn(){ return $('#btn-generate-key'); },
};

// ——— Status banner ——— //
export function setStatus(state, text) {
  const banner = el.statusBanner;
  const dot = el.statusDot;
  banner.className = 'status-banner';
  dot.className = 'status-dot';
  if (state === 'on') {
    banner.classList.add('status-banner--on');
    dot.classList.add('status-dot--active');
  } else if (state === 'error') {
    banner.classList.add('status-banner--err');
  } else {
    banner.classList.add('status-banner--off');
  }
  el.statusText.textContent = text;
}

// ——— Log rendering ——— //
export function appendLog(entry) {
  if (!entry) { el.logArea.innerHTML = ''; return; }
  const line = document.createElement('div');
  line.className = `log--${entry.level}`;
  line.textContent = `[${entry.time}] ${entry.msg}`;
  el.logArea.appendChild(line);
  el.logArea.scrollTop = el.logArea.scrollHeight;
}

// ——— Event list rendering ——— //
export async function renderEvents() {
  const events = await storage.getAllEvents();
  const list = el.eventList;
  el.eventCount.textContent = events.length;

  if (events.length === 0) {
    list.innerHTML = '<div class="event-list__empty">No stored events yet.</div>';
    return;
  }

  list.innerHTML = events.map(ev => `
    <div class="event-row">
      <span class="event-row__kind">kind:${ev.kind}</span>
      <span class="event-row__pubkey" title="${ev.pubkey}">${ev.pubkey.slice(0, 16)}…</span>
      <span class="event-row__time">${formatTime(ev.created_at)}</span>
      <span class="event-row__actions">
        <button class="btn btn--ghost btn--sm" data-view-id="${ev.id}">↗</button>
      </span>
    </div>
  `).join('');

  // Attach view handlers
  list.querySelectorAll('[data-view-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ev = events.find(e => e.id === btn.dataset.viewId);
      if (ev) showEventDetail(ev);
    });
  });
}

function formatTime(ts) {
  return new Date(ts * 1000).toLocaleTimeString('en-GB', { hour12: false });
}

function showEventDetail(event) {
  el.modalBody.innerHTML = `
    <h3 style="margin-bottom:var(--space-sm)">Event Detail</h3>
    <pre>${JSON.stringify(event, null, 2)}</pre>
  `;
  el.modal.classList.add('open');
}

// ——— Whitelist chips ——— //
export function renderWhitelist(pubkeys, onRemove) {
  const container = el.chipList;
  container.innerHTML = '';
  pubkeys.forEach(pk => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = pk.slice(0, 16) + '…';
    chip.title = pk;
    const rm = document.createElement('button');
    rm.className = 'chip__remove';
    rm.textContent = '×';
    rm.addEventListener('click', () => onRemove(pk));
    chip.appendChild(rm);
    container.appendChild(chip);
  });
  if (pubkeys.length === 0) {
    container.innerHTML = '<span style="color:var(--text-tertiary);font-size:0.78rem">All pubkeys allowed (open relay)</span>';
  }
}

// ——— Theme ——— //
export function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  el.themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// ——— Modal ——— //
export function initModal() {
  el.modalClose.addEventListener('click', () => el.modal.classList.remove('open'));
  el.modal.addEventListener('click', (e) => {
    if (e.target === el.modal) el.modal.classList.remove('open');
  });
}
