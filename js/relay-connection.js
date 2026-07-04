/**
 * NNS Hidden Relay — WebSocket connection to rendezvous relay
 */
import * as log from './logger.js';

export class RelayConnection {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this._onEvent = null;
    this._onStatus = null;
    this._subId = null;
    this._reconnectTimer = null;
    this._intentionallyClosed = false;
  }

  /** Set callback for incoming events: fn(event) */
  onEvent(fn) { this._onEvent = fn; }

  /** Set callback for status changes: fn('connecting'|'open'|'closed'|'error') */
  onStatus(fn) { this._onStatus = fn; }

  /** Connect and subscribe to kind:27901 events for our pubkey. */
  connect(ourPubkey) {
    this._intentionallyClosed = false;
    this._ourPubkey = ourPubkey;
    this._openSocket();
  }

  _openSocket() {
    if (this.ws) this._cleanup();
    this._setStatus('connecting');
    log.info(`Connecting to ${this.url}…`);

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this._setStatus('open');
      log.ok(`Connected to ${this.url}`);
      this._subscribe();
    };

    this.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        this._handleMessage(msg);
      } catch (e) {
        log.err(`Bad message: ${e.message}`);
      }
    };

    this.ws.onerror = () => {
      log.err(`WebSocket error on ${this.url}`);
      this._setStatus('error');
    };

    this.ws.onclose = () => {
      this._setStatus('closed');
      if (!this._intentionallyClosed) {
        log.info('Connection lost. Reconnecting in 5s…');
        this._reconnectTimer = setTimeout(() => this._openSocket(), 5000);
      } else {
        log.info('Disconnected.');
      }
    };
  }

  /** Subscribe for kind:27901 events addressed to our pubkey. */
  _subscribe() {
    this._subId = 'nns_' + Math.random().toString(36).slice(2, 10);
    const filter = {
      kinds: [27901],
      '#p': [this._ourPubkey],
    };
    const req = JSON.stringify(['REQ', this._subId, filter]);
    this.ws.send(req);
    log.info(`Subscribed (${this._subId}) for kind:27901 → ${this._ourPubkey.slice(0, 12)}…`);
  }

  _handleMessage(msg) {
    if (!Array.isArray(msg)) return;
    const [type] = msg;

    if (type === 'EVENT' && msg[2]) {
      if (this._onEvent) this._onEvent(msg[2]);
    } else if (type === 'EOSE') {
      log.info('End of stored events. Listening for new events…');
    } else if (type === 'NOTICE') {
      log.info(`Relay notice: ${msg[1]}`);
    } else if (type === 'OK') {
      // publish acknowledgement
      const [, eventId, success, reason] = msg;
      if (success) {
        log.ok(`Event ${eventId.slice(0, 12)}… published`);
      } else {
        log.err(`Publish rejected: ${reason}`);
      }
    }
  }

  /** Send a signed event to the relay. */
  publish(event) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      log.err('Cannot publish: not connected');
      return false;
    }
    this.ws.send(JSON.stringify(['EVENT', event]));
    return true;
  }

  /** Gracefully disconnect. */
  disconnect() {
    this._intentionallyClosed = true;
    clearTimeout(this._reconnectTimer);
    if (this.ws) {
      if (this._subId && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(['CLOSE', this._subId]));
      }
      this.ws.close();
    }
    this._cleanup();
  }

  _cleanup() {
    this.ws = null;
    this._subId = null;
  }

  _setStatus(s) {
    if (this._onStatus) this._onStatus(s);
  }
}
