// js/nrv-format.js — The two address formats defined by the hidden relay NIP:
//   • display form : bech32 'nrvrelay1…'  (TLV 0 = pubkey, TLV 1 = rendezvous relays)
//   • wire form    : 'nostr+nrv://<hexpubkey>?relay=<rv1>&relay=<rv2>' used in r-tags
import { decodeToBytes } from './bech32.js';

const NT = window.NostrTools;
const utf8 = new TextEncoder();
const utf8Decode = new TextDecoder();

export const NRV_PREFIX = 'nrvrelay';
export const NRV_SCHEME = 'nostr+nrv://';

const TLV_PUBKEY = 0;
const TLV_RELAY = 1;

// ——— TLV ——— //
function encodeTLV(tlv) {
  const entries = [];
  const types = Object.keys(tlv).sort((a, b) => a - b);
  for (const t of types) {
    for (const v of tlv[t]) {
      for (let i = 0; i < v.length; i += 255) {
        const chunk = v.slice(i, i + 255);
        const entry = new Uint8Array(chunk.length + 2);
        entry[0] = parseInt(t);
        entry[1] = chunk.length;
        entry.set(chunk, 2);
        entries.push(entry);
      }
    }
  }
  const out = new Uint8Array(entries.reduce((s, e) => s + e.length, 0));
  let off = 0;
  for (const e of entries) { out.set(e, off); off += e.length; }
  return out;
}

function decodeTLV(bytes) {
  const result = {};
  let rest = bytes;
  while (rest.length > 0) {
    if (rest.length < 2) throw new Error('Truncated TLV header');
    const type = rest[0];
    const len = rest[1];
    const value = rest.slice(2, 2 + len);
    if (value.length < len) throw new Error(`Truncated TLV value for type ${type}`);
    (result[type] ||= []).push(value);
    rest = rest.slice(2 + len);
  }
  return result;
}

function bytesToHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  return bytes;
}
function assertPubkey(hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('Pubkey must be 32 bytes of hex');
  return hex.toLowerCase();
}

// ——— nrvrelay1… (display) ——— //
export function nrvrelayEncode(hexPubkey, relayUrls = []) {
  const data = encodeTLV({
    [TLV_PUBKEY]: [hexToBytes(assertPubkey(hexPubkey))],
    [TLV_RELAY]: relayUrls.map(url => utf8.encode(url)),
  });
  return NT.nip19.encodeBytes(NRV_PREFIX, data);
}

/** @returns {{ pubkey: string, relays: string[] }} */
export function nrvrelayDecode(str) {
  const { prefix, bytes } = decodeToBytes(str.trim());
  if (prefix !== NRV_PREFIX) throw new Error(`Expected ${NRV_PREFIX}1… but got ${prefix}1…`);

  const tlv = decodeTLV(bytes);
  const pubkeyBytes = tlv[TLV_PUBKEY]?.[0];
  if (!pubkeyBytes) throw new Error(`Missing TLV ${TLV_PUBKEY} (pubkey)`);
  if (pubkeyBytes.length !== 32) throw new Error(`TLV ${TLV_PUBKEY} must be 32 bytes`);

  return {
    pubkey: bytesToHex(pubkeyBytes),
    relays: (tlv[TLV_RELAY] || []).map(v => utf8Decode.decode(v)),
  };
}

// ——— nostr+nrv://… (wire, for r-tags) ——— //
export function nrvUriEncode(hexPubkey, relayUrls = []) {
  const query = relayUrls
    .filter(Boolean)
    .map(url => `relay=${encodeURIComponent(url)}`)
    .join('&');
  return `${NRV_SCHEME}${assertPubkey(hexPubkey)}${query ? '?' + query : ''}`;
}

/** @returns {{ pubkey: string, relays: string[] }} */
export function nrvUriDecode(uri) {
  const match = /^nostr\+nrv:\/\/([0-9a-fA-F]{64})(?:\?(.*))?$/.exec(String(uri).trim());
  if (!match) throw new Error('Not a valid nostr+nrv:// reference');

  const relays = [];
  for (const pair of (match[2] || '').split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq === -1 || pair.slice(0, eq) !== 'relay') continue;
    // '+' means space in a query string; relay URLs encode a literal '+' as %2B
    const value = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, '%20')).trim();
    if (value) relays.push(value);
  }
  return { pubkey: match[1].toLowerCase(), relays };
}

/** True if an r-tag value points at a hidden relay rather than a normal one. */
export function isNrvUri(value) {
  return typeof value === 'string' && value.trim().startsWith(NRV_SCHEME);
}
