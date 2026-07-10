// js/config.js — Constants and defaults

export const DEFAULTS = {
  rendezvousRelays: ['wss://nos.lol'],
  relayName: 'NNS Hidden Relay',
  relayDescription: 'A browser-based NNS hidden relay',
};

export const KIND = {
  RELAY_LIST:      10112,
  RELAY_INFO:      10113,
  KEYRING_PUBLIC:  17991,
  NNS_MESSAGE:     27901,
};

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
