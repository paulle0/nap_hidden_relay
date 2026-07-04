/**
 * NNS Hidden Relay — Crypto helpers
 * Key generation, signing, NIP-44/04 encryption, bech32 encoding.
 */
import { STORAGE_KEY, KIND } from './config.js';

const NT = window.NostrTools;

// ——— Key generation & derivation ——— //

export function generateSecretKey() {
  return NT.generateSecretKey();
}

export function getPublicKey(sk) {
  return NT.getPublicKey(sk);
}

// ——— Byte/hex conversion ——— //

export function bytesToHex(bytes) {
  return Array.from(bytes, b =>
    b.toString(16).padStart(2, '0')
  ).join('');
}

export function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// ——— Bech32 nsec / npub ——— //

export function nsecEncode(skBytes) {
  return NT.nip19.nsecEncode(skBytes);
}

export function npubEncode(hexPubkey) {
  return NT.nip19.npubEncode(hexPubkey);
}

export function nsecDecode(nsecStr) {
  const { type, data } = NT.nip19.decode(nsecStr);
  if (type !== 'nsec') throw new Error('Not an nsec string');
  return data;
}

export function npubDecode(npubStr) {
  const { type, data } = NT.nip19.decode(npubStr);
  if (type !== 'npub') throw new Error('Not an npub string');
  return data;
}

// ——— nrvrelay bech32 encoding (NNS NIP) ——— //

/**
 * NIP-19 compliant TLV encoding helper.
 * Each entry: 1-byte type, 1-byte length (max 255), value bytes.
 * Values >255 bytes are split across multiple entries of the
 * same type, matching the nostr-tools encodeTLV pattern.
 * @param {Object} tlv — { type: [Uint8Array, …], … }
 * @returns {Uint8Array}
 */
function encodeTLV(tlv) {
  const entries = [];
  // Reverse key order to match nostr-tools convention
  const keys = Object.keys(tlv).sort((a, b) => b - a);
  for (const t of keys) {
    for (const v of tlv[t]) {
      // Split values >255 bytes into 255-byte chunks
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
  const total = entries.reduce((s, e) => s + e.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const e of entries) { out.set(e, off); off += e.length; }
  return out;
}

/**
 * Encode an nrvrelay1… bech32 string per the NNS NIP spec.
 * TLV 0 = 32-byte relay pubkey
 * TLV 1 = rendezvous relay URLs (one per entry)
 * TLV 2 = optional administrator pubkey (omitted here)
 * TLV 3 = kind number 10112 (4 bytes big-endian)
 */
export function nrvrelayEncode(hexPubkey, relayUrls) {
  const utf8 = new TextEncoder();
  const kindBuf = new ArrayBuffer(4);
  new DataView(kindBuf).setUint32(0, KIND.RELAY_LIST, false);

  const data = encodeTLV({
    0: [hexToBytes(hexPubkey)],
    1: relayUrls.map(url => utf8.encode(url)),
    3: [new Uint8Array(kindBuf)],
  });

  // NT.nip19.encodeBytes calls the internal bech32.toWords + bech32.encode
  // (bech32 is not directly exported by nostr-tools)
  return NT.nip19.encodeBytes('nrvrelay', data);
}

// ——— Persistence ——— //

export function saveSecretKey(sk) {
  localStorage.setItem(STORAGE_KEY.SECRET_KEY, bytesToHex(sk));
}

export function loadSecretKey() {
  const hex = localStorage.getItem(STORAGE_KEY.SECRET_KEY);
  if (!hex) return null;
  return hexToBytes(hex);
}

export function clearSecretKey() {
  localStorage.removeItem(STORAGE_KEY.SECRET_KEY);
}

// ——— Event signing ——— //

export function signEvent(sk, t) {
  const template = {
    kind: t.kind,
    tags: t.tags || [],
    content: t.content || '',
    created_at: t.created_at || Math.floor(Date.now() / 1000),
  };
  return NT.finalizeEvent(template, sk);
}

// ——— NIP-44 ——— //

export function nip44Encrypt(sk, recipientPubkey, plaintext) {
  const ck = NT.nip44.v2.utils.getConversationKey(
    sk, recipientPubkey
  );
  return NT.nip44.v2.encrypt(plaintext, ck);
}

export function nip44Decrypt(sk, senderPubkey, ciphertext) {
  const ck = NT.nip44.v2.utils.getConversationKey(
    sk, senderPubkey
  );
  return NT.nip44.v2.decrypt(ciphertext, ck);
}

// ——— NIP-04 (fallback) ——— //

export async function nip04Encrypt(sk, recipientPk, plaintext) {
  return NT.nip04.encrypt(sk, recipientPk, plaintext);
}

export async function nip04Decrypt(sk, senderPk, ciphertext) {
  return NT.nip04.decrypt(sk, senderPk, ciphertext);
}

// ——— Verification ——— //

export function verifyEvent(event) {
  return NT.verifyEvent(event);
}
