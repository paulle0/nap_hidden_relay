// js/relay-handler.js — Processes incoming kind:27901 NNS tunnel events
import { KIND } from './config.js';
import * as crypto from './crypto.js';
import * as storage from './storage.js';
import * as log from './logger.js';

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
    if (event.kind !== KIND.NNS_MESSAGE) return;
    const sender = event.pubkey;

    if (this._whitelist.size === 0) {
      log.info(`Rejected ${sender.slice(0, 12)}… (no pubkeys whitelisted)`);
      return;
    }
    if (!this._whitelist.has(sender)) {
      log.info(`Rejected ${sender.slice(0, 12)}… (not whitelisted)`);
      return;
    }

    const encTag = event.tags.find(t => t[0] === 'encryption');
    const encType = encTag ? encTag[1] : 'nip04';

    let plaintext;
    try {
      if (encType === 'nip44_v2' || encType === 'nip44') {
        plaintext = crypto.nip44Decrypt(this.sk, sender, event.content);
      } else {
        plaintext = await crypto.nip04Decrypt(this.sk, sender, event.content);
      }
    } catch (e) {
      log.err(`Decrypt failed from ${sender.slice(0, 12)}…: ${e.message}`);
      return;
    }

    log.ok(`Decrypted from ${sender.slice(0, 12)}…`);
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
    const plaintext = JSON.stringify(responseMsg);
    let ciphertext;
    try {
      ciphertext = crypto.nip44Encrypt(this.sk, recipientPubkey, plaintext);
    } catch {
      ciphertext = await crypto.nip04Encrypt(this.sk, recipientPubkey, plaintext);
    }
    const event = crypto.signEvent(this.sk, {
      kind: KIND.NNS_MESSAGE,
      tags: [['p', recipientPubkey], ['encryption', 'nip44_v2']],
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
