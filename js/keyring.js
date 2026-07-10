// js/keyring.js — Resolves keyring subkeys for whitelisted pubkeys
// Reads kind:17991 events from the relay's own IndexedDB store.
// A masterkey event has ["l","rootkey"] and ["p",<subkey>] tags.
// A subkey event has ["l","subkey"] and ["p",<masterkey>] tag.
import { KIND } from './config.js';
import * as storage from './storage.js';
import * as log from './logger.js';

const REFRESH_INTERVAL = 60_000; // re-scan stored events every 60 s

export class KeyringResolver {
  constructor() {
    this._masterKeys = new Set();       // user-configured whitelist
    this._subkeyMap = new Map();        // masterPk → Set<subkeyPk>
    this._timer = null;
    this._onUpdate = null;
  }

  /** Register a callback fired when the effective whitelist changes. */
  onUpdate(fn) { this._onUpdate = fn; }

  /** Replace the set of master pubkeys and trigger a refresh. */
  setMasterKeys(pubkeys) {
    this._masterKeys = new Set(pubkeys);
    for (const pk of this._subkeyMap.keys()) {
      if (!this._masterKeys.has(pk)) this._subkeyMap.delete(pk);
    }
    this._emitUpdate();
    this.refresh();
  }

  /** Returns the full effective whitelist (masters + resolved subkeys). */
  getEffectiveWhitelist() {
    const set = new Set(this._masterKeys);
    for (const subs of this._subkeyMap.values()) {
      for (const pk of subs) set.add(pk);
    }
    return set;
  }

  /** Scan stored events for kind:17991 keyring events. */
  async refresh() {
    if (this._masterKeys.size === 0) return;
    try {
      const allEvents = await storage.getAllEvents();
      const keyringEvents = allEvents.filter(
        ev => ev.kind === KIND.KEYRING_PUBLIC
      );
      for (const masterPk of this._masterKeys) {
        this._resolveForMaster(masterPk, keyringEvents);
      }
    } catch (e) {
      log.err(`Keyring refresh failed: ${e.message}`);
    }
  }

  /** Start periodic refresh. */
  startPolling() {
    this.stopPolling();
    this.refresh();
    this._timer = setInterval(() => this.refresh(), REFRESH_INTERVAL);
  }

  /** Stop periodic refresh. */
  stopPolling() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  /** Resolve subkeys for one master pubkey from stored keyring events. */
  _resolveForMaster(masterPk, keyringEvents) {
    // Find the most recent rootkey event published by this masterPk
    const masterEvent = keyringEvents
      .filter(ev => ev.pubkey === masterPk && hasLabel(ev, 'rootkey'))
      .sort((a, b) => b.created_at - a.created_at)[0];

    if (!masterEvent) {
      if (this._subkeyMap.has(masterPk)) {
        this._subkeyMap.delete(masterPk);
        this._emitUpdate();
      }
      return;
    }

    // Extract subkey pubkeys from p-tags
    const subkeys = new Set();
    for (const tag of masterEvent.tags) {
      if (tag[0] === 'p' && tag[1] && /^[0-9a-f]{64}$/i.test(tag[1])) {
        subkeys.add(tag[1].toLowerCase());
      }
    }

    const prev = this._subkeyMap.get(masterPk);
    if (!setsEqual(prev, subkeys)) {
      this._subkeyMap.set(masterPk, subkeys);
      if (subkeys.size > 0) {
        log.ok(`Keyring: ${masterPk.slice(0, 12)}… → ${subkeys.size} subkey(s)`);
      }
      this._emitUpdate();
    }
  }

  _emitUpdate() {
    if (this._onUpdate) this._onUpdate(this.getEffectiveWhitelist());
  }
}

/** Check if an event has an ["l", value] tag. */
function hasLabel(event, value) {
  return event.tags.some(t => t[0] === 'l' && t[1] === value);
}

function setsEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.size !== b.size) return false;
  for (const v of a) { if (!b.has(v)) return false; }
  return true;
}
