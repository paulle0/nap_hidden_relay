/**
 * NNS Hidden Relay — Logger
 * Manages in-app log entries shown in the GUI console area.
 */

const MAX_ENTRIES = 200;
let _entries = [];
let _listener = null;

function _ts() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

function _push(level, msg) {
  const entry = { time: _ts(), level, msg };
  _entries.push(entry);
  if (_entries.length > MAX_ENTRIES) _entries.shift();
  if (_listener) _listener(entry, _entries);
}

export function info(msg) { _push('info', msg); }
export function ok(msg)   { _push('ok', msg); }
export function err(msg)  { _push('err', msg); }

/** Register a callback: fn(latestEntry, allEntries) */
export function onLog(fn) { _listener = fn; }

export function getAll() { return _entries; }

export function clear() {
  _entries = [];
  if (_listener) _listener(null, []);
}
