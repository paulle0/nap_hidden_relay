// js/main.js — App boot
import { state, setState, subscribe } from './state.js';
import { STORAGE_KEY } from './config.js';
import { getThemePref } from './storage.js';
import { applyView, wireTopNav } from './router.js';
import { toggleTheme } from './ui-utils.js';
import * as crypto from './crypto.js';
import * as log from './logger.js';
import { stopRelay } from './relay-engine.js';

function init() {
  // Theme
  const theme = getThemePref();
  document.documentElement.setAttribute('data-theme', theme);
  state.theme = theme;

  // Restore session
  const loggedIn = localStorage.getItem(STORAGE_KEY.LOGGED_IN) === '1';
  const sk = crypto.loadSecretKey();

  if (loggedIn && sk) {
    const savedRelays = localStorage.getItem(STORAGE_KEY.RELAY_URLS);
    const savedWhitelist = localStorage.getItem(STORAGE_KEY.WHITELIST);
    state.secretKey = sk;
    state.relayUrls = savedRelays ? JSON.parse(savedRelays) : [];
    state.whitelist = savedWhitelist ? JSON.parse(savedWhitelist) : [];
    state.view = 'relay';
  } else {
    state.view = 'login';
  }

  // Theme toggle
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  // Logout button
  document.getElementById('logoutBtn').addEventListener('click', () => {
    if (!confirm('Log out? Your relay will stop.')) return;
    stopRelay();
    crypto.clearSecretKey();
    localStorage.removeItem(STORAGE_KEY.LOGGED_IN);
    setState({ secretKey: null, relayUrls: [], whitelist: [], running: false, view: 'login' });
  });

  // Wire nav
  wireTopNav();

  // Subscribe to state changes
  subscribe(() => applyView());

  // Initial render
  applyView();
  log.info('nrv hidden relay ready.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
