// js/relay-connection.js — WebSocket connection to a single rendezvous relay
import { KIND } from './config.js';
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

  onEvent(fn) { this._onEvent = fn; }
  onStatus(fn) { this._onStatus = fn; }

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
        log.info(`Lost ${this.url}. Reconnecting in 5 s…`);
        this._reconnectTimer = setTimeout(() => this._openSocket(), 5000);
      }
    };
  }

  _subscribe() {
    this._subId = 'nrv-' + Math.random().toString(36).slice(2, 10);
    const filter = { kinds: [KIND.NRV_MESSAGE], '#p': [this._ourPubkey] };
    this.send(['REQ', this._subId, filter]);
  }

  _handleMessage(msg) {
    const [type] = msg;
    if (type === 'EVENT' && msg[2]) {
      if (this._onEvent) this._onEvent(msg[2]);
    } else if (type === 'EOSE') {
      log.info(`EOSE on ${this.url}`);
    } else if (type === 'NOTICE') {
      log.info(`NOTICE ${this.url}: ${msg[1]}`);
    }
  }

  send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  disconnect() {
    this._intentionallyClosed = true;
    clearTimeout(this._reconnectTimer);
    this._cleanup();
  }

  _cleanup() {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (this.ws.readyState === WebSocket.OPEN) this.ws.close();
      this.ws = null;
    }
  }

  _setStatus(status) {
    if (this._onStatus) this._onStatus(status, this.url);
  }
}
