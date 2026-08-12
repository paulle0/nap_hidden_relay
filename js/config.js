// js/config.js — Constants and defaults

export const DEFAULTS = {
  rendezvousRelays: ['wss://nos.lol'],
  relayName: 'nap hidden relay',
  relayDescription: 'A browser-based nap hidden relay',
};

export const KIND = {
  RELAY_LIST:      10112,
  RELAY_INFO:      10113,
  KEYRING_PUBLIC:  17991,
  NRV_MESSAGE:     27901,
};

// The only encryption scheme named by the hidden relay NIP.
export const ENCRYPTION = 'nip44_v2';

// Ephemeral range from NIP-01 — these are relayed but never stored.
export const EPHEMERAL_RANGE = { min: 20000, max: 29999 };

export function isEphemeralKind(kind) {
  return kind >= EPHEMERAL_RANGE.min && kind <= EPHEMERAL_RANGE.max;
}

// Note: the stored *values* below intentionally keep their historical `nns_`
// prefix. Renaming them would orphan every existing session and event store.
export const STORAGE_KEY = {
  SECRET_KEY:  'nns_secret_key',
  RELAY_URLS:  'nns_relay_urls',
  WHITELIST:   'nns_whitelist',
  THEME:       'nns_theme',
  LOGGED_IN:   'nns_logged_in',
};

export const DB = {
  name:    'nns_hidden_relay',
  version: 1,
  store:   'events',
};
