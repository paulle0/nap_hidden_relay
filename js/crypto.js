// js/crypto.js — Key generation, signing, NIP-44 encryption, npub/nsec bech32
// Address formats (nrvrelay1… and nostr+nrv://…) live in js/nrv-format.js
import { STORAGE_KEY } from './config.js';

const NT = window.NostrTools;

// ——— Key generation & derivation ——— //
export function generateSecretKey() { return NT.generateSecretKey(); }
export function getPublicKey(sk) { return NT.getPublicKey(sk); }

// ——— Byte/hex conversion ——— //
export function bytesToHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
export function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// ——— Bech32 nsec / npub ——— //
export function nsecEncode(skBytes) { return NT.nip19.nsecEncode(skBytes); }
export function npubEncode(hexPk) { return NT.nip19.npubEncode(hexPk); }
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

// ——— Persistence ——— //
export function saveSecretKey(sk) {
  localStorage.setItem(STORAGE_KEY.SECRET_KEY, bytesToHex(sk));
}
export function loadSecretKey() {
  const hex = localStorage.getItem(STORAGE_KEY.SECRET_KEY);
  return hex ? hexToBytes(hex) : null;
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

// ——— NIP-44 v2 — the only encryption the hidden relay NIP defines ——— //
export function nip44Encrypt(sk, recipientPk, plaintext) {
  const ck = NT.nip44.v2.utils.getConversationKey(sk, recipientPk);
  return NT.nip44.v2.encrypt(plaintext, ck);
}
export function nip44Decrypt(sk, senderPk, ciphertext) {
  const ck = NT.nip44.v2.utils.getConversationKey(sk, senderPk);
  return NT.nip44.v2.decrypt(ciphertext, ck);
}

// ——— Verification ——— //
export function verifyEvent(event) { return NT.verifyEvent(event); }
