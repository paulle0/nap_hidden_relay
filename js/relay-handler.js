/**
 * NNS Hidden Relay — Message handler
 * Processes incoming kind:27901 tunnel events, decrypts, and responds.
 */
import { KIND } from './config.js';
import * as crypto from './crypto.js';
import * as storage from './storage.js';
import * as log from './logger.js';
import { matchFilter, queryEvents } from './filter.js';

export class RelayHandler {
  /**
   * @param {Uint8Array} secretKey
   * @param {Function}   publishFn     — fn(signedEvent) to send back
   * @param {Function}   onStoreUpdate — called when stored events change
   */
  constructor(secretKey, publishFn, onStoreUpdate) {
    this.sk = secretKey;
    this.pubkey = crypto.getPublicKey(secretKey);
    this.publish = publishFn;
    this.onStoreUpdate = onStoreUpdate;
    this._whitelist = new Set();
    // Keyed by "clientPubkey:subId" to avoid cross-client collisions
    this._activeSubs = new Map();
  }

  setWhitelist(pubkeys) {
    this._whitelist = new Set(pubkeys);
  }

  /** Handle a raw kind:27901 event from the rendezvous relay. */
  async handleEvent(event) {
    if (event.kind !== KIND.NNS_MESSAGE) return;

    // 1) Verify outer event signature
    if (!crypto.verifyEvent(event)) {
      log.err(`Invalid signature from ${event.pubkey?.slice(0, 12)}…`);
      return;
    }

    // 2) Verify the event is addressed to this relay via p-tag
    const pTag = event.tags.find(t => t[0] === 'p' && t[1] === this.pubkey);
    if (!pTag) {
      log.info('Ignored event not addressed to this relay');
      return;
    }

    const senderPubkey = event.pubkey;

    // 3) Whitelist check
    if (this._whitelist.size > 0 && !this._whitelist.has(senderPubkey)) {
      log.info(`Ignored event from non-whitelisted ${senderPubkey.slice(0, 12)}…`);
      return;
    }

    // 4) Require nip44_v2 encryption
    const encTag = event.tags.find(t => t[0] === 'encryption');
    const encType = encTag ? encTag[1] : null;
    if (encType !== 'nip44_v2' && encType !== 'nip44') {
      log.err(`Unsupported or missing encryption: ${encType || 'none'}`);
      return;
    }

    // 5) Decrypt content
    let plaintext;
    try {
      plaintext = crypto.nip44Decrypt(this.sk, senderPubkey, event.content);
    } catch (e) {
      log.err(`Decrypt failed from ${senderPubkey.slice(0, 12)}…: ${e.message}`);
      return;
    }

    log.ok(`Decrypted message from ${senderPubkey.slice(0, 12)}…`);

    // 6) Parse inner Nostr wire message
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

  // ——— Inner message dispatch ——— //
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

    // Verify the inner event's signature before storing
    if (!crypto.verifyEvent(innerEvent)) {
      await this._sendResponse(clientPubkey,
        ['OK', innerEvent.id, false, 'invalid: bad signature']);
      return;
    }

    log.info(`Storing event ${innerEvent.id.slice(0, 12)}… kind:${innerEvent.kind}`);
    try {
      await storage.putEvent(innerEvent);
      await this._sendResponse(clientPubkey, ['OK', innerEvent.id, true, '']);
      if (this.onStoreUpdate) this.onStoreUpdate();
      // Push to any active subscriptions whose filters match
      await this._pushToSubscribers(innerEvent);
    } catch (e) {
      log.err(`Store failed: ${e.message}`);
      await this._sendResponse(clientPubkey,
        ['OK', innerEvent.id, false, `error: ${e.message}`]);
    }
  }

  /** Client requested events matching filters. */
  async _handleInnerReq(msg, clientPubkey) {
    const subId = msg[1];
    const filters = msg.slice(2);
    const subKey = `${clientPubkey}:${subId}`;
    log.info(`REQ ${subId} (${filters.length} filter(s)) from ${clientPubkey.slice(0, 12)}…`);

    this._activeSubs.set(subKey, { filters, clientPubkey, subId });

    // Retrieve matching events from storage (already sorted newest-first)
    const allEvents = await storage.getAllEvents();
    const matched = queryEvents(allEvents, filters);

    for (const ev of matched) {
      await this._sendResponse(clientPubkey, ['EVENT', subId, ev]);
    }
    await this._sendResponse(clientPubkey, ['EOSE', subId]);
    log.info(`Sent ${matched.length} event(s) + EOSE for ${subId}`);
  }

  _handleInnerClose(subId, clientPubkey) {
    const subKey = `${clientPubkey}:${subId}`;
    this._activeSubs.delete(subKey);
    log.info(`Subscription ${subId} closed`);
  }

  // ——— Live subscription push ——— //

  /** Push a newly stored event to all active subscriptions whose filters match. */
  async _pushToSubscribers(event) {
    for (const [, sub] of this._activeSubs) {
      const matches = sub.filters.some(f => matchFilter(event, f));
      if (matches) {
        await this._sendResponse(sub.clientPubkey, ['EVENT', sub.subId, event]);
      }
    }
  }

  // ——— Encrypted response ——— //

  /** Encrypt a relay response and publish as kind:27901. */
  async _sendResponse(recipientPubkey, responseMsg) {
    const plaintext = JSON.stringify(responseMsg);
    let ciphertext;
    try {
      ciphertext = crypto.nip44Encrypt(this.sk, recipientPubkey, plaintext);
    } catch (e) {
      log.err(`Encrypt failed for ${recipientPubkey.slice(0, 12)}…: ${e.message}`);
      return;
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
