/**
 * NNS Hidden Relay — Configuration
 */

export const DEFAULTS = {
  rendezvousRelay: 'wss://nos.lol',
  relayName: 'NNS Hidden Relay',
  relayDescription: 'A browser-based NNS hidden relay (proof of concept)',
};

// NNS protocol event kinds
export const KIND = {
  RELAY_LIST:  10112,  // rendezvous relay list (replaceable)
  RELAY_INFO:  10113,  // relay info document (replaceable)
  NNS_MESSAGE: 27901,  // ephemeral tunnelled messages
};

// LocalStorage keys for persistent settings
export const STORAGE_KEY = {
  SECRET_KEY:  'nns_secret_key',
  RELAY_URL:   'nns_relay_url',
  WHITELIST:   'nns_whitelist',
  THEME:       'nns_theme',
};

// IndexedDB config for event storage
export const DB = {
  name:    'nns_hidden_relay',
  version: 1,
  store:   'events',
};
