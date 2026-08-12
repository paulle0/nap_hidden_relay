// js/relay-handler.js — Processes incoming kind:27901 nrv tunnel events
import { KIND, ENCRYPTION, isEphemeralKind } from './config.js';
import * as crypto from './crypto.js';
import * as storage from './storage.js';
import * as log from './logger.js';

const short = (pk) => `${String(pk).slice(0, 12)}…`;

export class RelayHandler {
  constructor(secretKey, publishFn, onStoreUpdate) {
    this.sk = secretKey;
    this.pubkey = crypto.getPublicKey(secretKey);
    this.publish = publishFn;
    this.onStoreUpdate = onStoreUpdate;
    this._whitelist = new Set();
    this._activeSubs = new Map();
  }

  setWhitelist(pubkeys) {
    this._whitelist = pubkeys instanceof Set ? pubkeys : new Set(pubkeys);
  }

  async handleEvent(event) {
    if (event.kind !== KIND.NRV_MESSAGE) return;
    const sender = event.pubkey;

    // Verify the signature *before* trusting event.pubkey — the whitelist
    // gates on that field, so an unverified event makes it trivial to spoof.
    let signatureValid = false;
    try { signatureValid = crypto.verifyEvent(event); } catch { signatureValid = false; }
    if (!signatureValid) {
      log.err(`Rejected ${short(sender)} (invalid signature)`);
      return;
    }

    if (this._whitelist.size === 0) {
      log.info(`Rejected ${short(sender)} (no pubkeys whitelisted)`);
      return;
    }
    if (!this._whitelist.has(sender)) {
      log.info(`Rejected ${short(sender)} (not whitelisted)`);
      return;
    }

    const encTag = event.tags.find(t => t[0] === 'encryption');
    const encType = encTag?.[1] || ENCRYPTION;
    if (encType !== ENCRYPTION) {
      log.err(`Rejected ${short(sender)} (unsupported encryption "${encType}")`);
      return;
    }

    let plaintext;
    try {
      plaintext = crypto.nip44Decrypt(this.sk, sender, event.content);
    } catch (e) {
      log.err(`Decrypt failed from ${short(sender)}: ${e.message}`);
      return;
    }

    log.ok(`Decrypted from ${short(sender)}`);
    let innerMsg;
    try { innerMsg = JSON.parse(plaintext); } catch {
      log.err('Inner message is not valid JSON');
      return;
    }
    if (!Array.isArray(innerMsg) || innerMsg.length < 2) {
      log.err('Inner message is not a valid Nostr wire message');
      return;
    }
    await this._processInner(innerMsg, sender);
  }

  async _processInner(msg, clientPubkey) {
    const [type] = msg;
    if (type === 'EVENT') await this._handleInnerEvent(msg[1], clientPubkey);
    else if (type === 'REQ') await this._handleInnerReq(msg, clientPubkey);
    else if (type === 'CLOSE') this._handleInnerClose(msg[1]);
    else log.info(`Unknown inner type: ${type}`);
  }

  async _handleInnerEvent(ev, clientPubkey) {
    if (!ev || !ev.id) {
      await this._sendResponse(clientPubkey, ['OK', '', false, 'invalid: missing id']);
      return;
    }

    // Ephemeral events are accepted but never written to storage. Without this
    // a client could tunnel a kind:27901 back in and have it persisted.
    if (isEphemeralKind(ev.kind)) {
      log.info(`Accepted ephemeral kind:${ev.kind} from ${short(clientPubkey)} (not stored)`);
      await this._sendResponse(clientPubkey, ['OK', ev.id, true, '']);
      return;
    }

    log.info(`Storing ${ev.id.slice(0, 12)}… kind:${ev.kind}`);
    try {
      await storage.putEvent(ev);
      await this._sendResponse(clientPubkey, ['OK', ev.id, true, '']);
      if (this.onStoreUpdate) this.onStoreUpdate();
    } catch (e) {
      log.err(`Store failed: ${e.message}`);
      await this._sendResponse(clientPubkey, ['OK', ev.id, false, `error: ${e.message}`]);
    }
  }

  async _handleInnerReq(msg, clientPubkey) {
    const subId = msg[1];
    const filters = msg.slice(2);
    log.info(`REQ ${subId} (${filters.length} filters)`);
    this._activeSubs.set(subId, { filters, clientPubkey });

    const allEvents = await storage.getAllEvents();
    const matched = allEvents.filter(ev => filters.some(f => matchFilter(ev, f)));
    for (const ev of matched) {
      await this._sendResponse(clientPubkey, ['EVENT', subId, ev]);
    }
    await this._sendResponse(clientPubkey, ['EOSE', subId]);
    log.info(`Sent ${matched.length} event(s) + EOSE for ${subId}`);
  }

  _handleInnerClose(subId) {
    this._activeSubs.delete(subId);
    log.info(`Sub ${subId} closed`);
  }

  async _sendResponse(recipientPubkey, responseMsg) {
    let ciphertext;
    try {
      ciphertext = crypto.nip44Encrypt(this.sk, recipientPubkey, JSON.stringify(responseMsg));
    } catch (e) {
      // Never fall back to another scheme — the encryption tag must stay honest.
      log.err(`Encrypt failed for ${short(recipientPubkey)}: ${e.message}`);
      return;
    }
    const event = crypto.signEvent(this.sk, {
      kind: KIND.NRV_MESSAGE,
      tags: [['p', recipientPubkey], ['encryption', ENCRYPTION]],
      content: ciphertext,
    });
    this.publish(event);
  }
}

function matchFilter(event, filter) {
  if (filter.ids && !filter.ids.includes(event.id)) return false;
  if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
  if (filter.since && event.created_at < filter.since) return false;
  if (filter.until && event.created_at > filter.until) return false;
  for (const [key, vals] of Object.entries(filter)) {
    if (key.startsWith('#') && Array.isArray(vals)) {
      const tagName = key.slice(1);
      const evVals = event.tags.filter(t => t[0] === tagName).map(t => t[1]);
      if (!vals.some(v => evVals.includes(v))) return false;
    }
  }
  return true;
}
