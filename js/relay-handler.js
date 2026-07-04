/**
 * NNS Hidden Relay — Message handler
 * Processes incoming kind:27901 NNS tunnel events.
 * Decrypts, interprets the inner Nostr wire message, stores events, sends responses.
 */
import { KIND } from './config.js';
import * as crypto from './crypto.js';
import * as storage from './storage.js';
import * as log from './logger.js';

export class RelayHandler {
  /**
   * @param {Uint8Array} secretKey
   * @param {Function}   publishFn — fn(signedEvent) to send back through the connection
   * @param {Function}   onStoreUpdate — called when stored events change
   */
  constructor(secretKey, publishFn, onStoreUpdate) {
    this.sk = secretKey;
    this.pubkey = crypto.getPublicKey(secretKey);
    this.publish = publishFn;
    this.onStoreUpdate = onStoreUpdate;
    this._whitelist = new Set();
    this._activeSubs = new Map(); // subId → { filters, clientPubkey }
  }

  setWhitelist(pubkeys) {
    this._whitelist = new Set(pubkeys);
  }

  /** Handle a raw kind:27901 event from the rendezvous relay. */
  async handleEvent(event) {
    // Basic validation
    if (event.kind !== KIND.NNS_MESSAGE) return;
    const senderPubkey = event.pubkey;

    // Whitelist check
    if (this._whitelist.size > 0 && !this._whitelist.has(senderPubkey)) {
      log.info(`Ignored event from non-whitelisted ${senderPubkey.slice(0, 12)}…`);
      return;
    }

    // Determine encryption type from tags
    const encTag = event.tags.find(t => t[0] === 'encryption');
    const encType = encTag ? encTag[1] : 'nip04';

    // Decrypt
    let plaintext;
    try {
      if (encType === 'nip44_v2' || encType === 'nip44') {
        plaintext = crypto.nip44Decrypt(this.sk, senderPubkey, event.content);
      } else {
        plaintext = await crypto.nip04Decrypt(this.sk, senderPubkey, event.content);
      }
    } catch (e) {
      log.err(`Decrypt failed from ${senderPubkey.slice(0, 12)}…: ${e.message}`);
      return;
    }

    log.ok(`Decrypted message from ${senderPubkey.slice(0, 12)}…`);

    // Parse inner Nostr wire message: ["EVENT", event], ["REQ", subId, ...filters], ["CLOSE", subId]
    let innerMsg;
    try {
      innerMsg = JSON.parse(plaintext);
    } catch {
      log.err('Inner message is not valid JSON');
      return;
    }

    if (!Array.isArray(innerMsg) || innerMsg.length < 2) {
      log.err('Inner message is not a valid Nostr wire message');
      return;
    }

    await this._processInner(innerMsg, senderPubkey);
  }

  async _processInner(msg, clientPubkey) {
    const [type] = msg;

    switch (type) {
      case 'EVENT':
        await this._handleInnerEvent(msg[1], clientPubkey);
        break;
      case 'REQ':
        await this._handleInnerReq(msg, clientPubkey);
        break;
      case 'CLOSE':
        this._handleInnerClose(msg[1], clientPubkey);
        break;
      default:
        log.info(`Unknown inner message type: ${type}`);
    }
  }

  /** Client submitted an event to store. */
  async _handleInnerEvent(innerEvent, clientPubkey) {
    if (!innerEvent || !innerEvent.id) {
      await this._sendResponse(clientPubkey, ['OK', '', false, 'invalid: missing event id']);
      return;
    }

    log.info(`Storing event ${innerEvent.id.slice(0, 12)}… kind:${innerEvent.kind}`);
    try {
      await storage.putEvent(innerEvent);
      await this._sendResponse(clientPubkey, ['OK', innerEvent.id, true, '']);
      if (this.onStoreUpdate) this.onStoreUpdate();
    } catch (e) {
      log.err(`Store failed: ${e.message}`);
      await this._sendResponse(clientPubkey, ['OK', innerEvent.id, false, `error: ${e.message}`]);
    }
  }

  /** Client requested events matching filters. */
  async _handleInnerReq(msg, clientPubkey) {
    const subId = msg[1];
    const filters = msg.slice(2);
    log.info(`REQ ${subId} with ${filters.length} filter(s) from ${clientPubkey.slice(0, 12)}…`);

    this._activeSubs.set(subId, { filters, clientPubkey });

    // Retrieve matching events from storage
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
    log.info(`Subscription ${subId} closed`);
  }

  /** Encrypt a response and publish as kind:27901 back to the client. */
  async _sendResponse(recipientPubkey, responseMsg) {
    const plaintext = JSON.stringify(responseMsg);
    let ciphertext;
    try {
      ciphertext = crypto.nip44Encrypt(this.sk, recipientPubkey, plaintext);
    } catch {
      // Fallback to nip04
      ciphertext = await crypto.nip04Encrypt(this.sk, recipientPubkey, plaintext);
    }

    const event = crypto.signEvent(this.sk, {
      kind: KIND.NNS_MESSAGE,
      tags: [
        ['p', recipientPubkey],
        ['encryption', 'nip44_v2'],
      ],
      content: ciphertext,
    });

    this.publish(event);
  }
}

/** Simple filter matcher (subset of NIP-01 filter logic). */
function matchFilter(event, filter) {
  if (filter.ids && !filter.ids.includes(event.id)) return false;
  if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
  if (filter.since && event.created_at < filter.since) return false;
  if (filter.until && event.created_at > filter.until) return false;
  // Tag filters (#e, #p, etc.)
  for (const [key, vals] of Object.entries(filter)) {
    if (key.startsWith('#') && Array.isArray(vals)) {
      const tagName = key.slice(1);
      const eventTagVals = event.tags.filter(t => t[0] === tagName).map(t => t[1]);
      if (!vals.some(v => eventTagVals.includes(v))) return false;
    }
  }
  return true;
}
