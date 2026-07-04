/**
 * NNS Hidden Relay — Relay announcer
 * Publishes kind:10112 (rendezvous relay list) and kind:10113
 * (relay info document) as specified in the NNS NIP.
 */
import { KIND, DEFAULTS } from './config.js';
import * as crypto from './crypto.js';
import * as log from './logger.js';

/**
 * Publish a kind:10112 replaceable event listing the rendezvous
 * relay(s) where this hidden relay can be reached.
 *
 * @param {Uint8Array} sk          — relay secret key
 * @param {string}     relayUrl    — rendezvous relay URL (wss://…)
 * @param {Function}   publishFn   — fn(signedEvent) to send the event
 */
export function publishRelayList(sk, relayUrl, publishFn) {
  const event = crypto.signEvent(sk, {
    kind: KIND.RELAY_LIST,
    tags: [['r', relayUrl]],
    content: '',
  });
  publishFn(event);
  log.ok('Published kind:10112 (rendezvous relay list)');
}

/**
 * Publish a kind:10113 replaceable event containing the NIP-11
 * relay information document and supported encryption.
 *
 * @param {Uint8Array} sk          — relay secret key
 * @param {Function}   publishFn   — fn(signedEvent) to send the event
 */
export function publishRelayInfo(sk, publishFn) {
  const infoDoc = JSON.stringify({
    name: DEFAULTS.relayName,
    description: DEFAULTS.relayDescription,
    supported_nips: [1, 11],
    software: 'nns-hidden-relay',
    version: '0.1.0',
  });

  const event = crypto.signEvent(sk, {
    kind: KIND.RELAY_INFO,
    tags: [['encryption', 'nip44_v2']],
    content: infoDoc,
  });
  publishFn(event);
  log.ok('Published kind:10113 (relay info document)');
}
