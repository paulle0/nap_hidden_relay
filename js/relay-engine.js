// js/relay-engine.js — Start/stop relay engine (pool + handler + announcer + keyring)
import { STORAGE_KEY } from './config.js';
import * as crypto from './crypto.js';
import * as log from './logger.js';
import { RelayPool } from './relay-pool.js';
import { RelayHandler } from './relay-handler.js';
import { KeyringResolver } from './keyring.js';
import { publishRelayList, publishRelayInfo } from './announcer.js';

let pool = null;
let handler = null;
let keyring = null;

export function isRunning() { return pool !== null; }

export function startRelay(secretKey, relayUrls, whitelist, { onStatus, onStoreUpdate }) {
  if (pool) stopRelay();
  if (!secretKey) { log.err('No identity.'); return; }
  if (relayUrls.length === 0) { log.err('No relays configured.'); return; }

  const pk = crypto.getPublicKey(secretKey);
  pool = new RelayPool();
  handler = new RelayHandler(secretKey, (ev) => pool.publish(ev), () => {
    if (onStoreUpdate) onStoreUpdate();
    // Re-scan keyring after new events are stored
    if (keyring) keyring.refresh();
  });

  // Set up keyring resolver — reads from local IndexedDB
  keyring = new KeyringResolver();
  keyring.onUpdate((effectiveSet) => {
    handler.setWhitelist(effectiveSet);
  });
  keyring.setMasterKeys(whitelist);

  let announced = false;
  const publishFn = (ev) => pool.publish(ev);

  pool.onEvent((event) => handler.handleEvent(event));
  pool.onStatus((url, status) => {
    if (status === 'open') {
      const n = pool.size;
      if (onStatus) onStatus('on', `Connected (${n} relay${n > 1 ? 's' : ''})`);
      if (!announced) {
        announced = true;
        publishRelayList(secretKey, relayUrls, publishFn);
        publishRelayInfo(secretKey, publishFn);
        keyring.startPolling();
      }
    } else if (status === 'error') {
      if (onStatus) onStatus('error', 'Connection error');
    }
  });

  pool.connect(relayUrls, pk);
  if (onStatus) onStatus('on', 'Connecting…');
  log.ok('Relay started.');
}

export function stopRelay() {
  if (keyring) { keyring.stopPolling(); keyring = null; }
  if (pool) { pool.disconnectAll(); pool = null; }
  handler = null;
  log.info('Relay stopped.');
}

export function updateWhitelist(whitelist) {
  if (keyring) keyring.setMasterKeys(whitelist);
  else if (handler) handler.setWhitelist(new Set(whitelist));
}
