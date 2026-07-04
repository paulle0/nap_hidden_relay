/**
 * NNS Hidden Relay — Crypto helpers
 * Wraps nostr-tools for key gen, event signing, NIP-44 encryption.
 */
import { STORAGE_KEY } from './config.js';

// nostr-tools is loaded as a global (IIFE bundle)
const NT = window.NostrTools;

/** Generate a fresh 32-byte secret key. */
export function generateSecretKey() {
  return NT.generateSecretKey();
}

/** Derive hex public key from a Uint8Array secret key. */
export function getPublicKey(sk) {
  return NT.getPublicKey(sk);
}

/** Convert Uint8Array to hex string. */
export function bytesToHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/** Convert hex string to Uint8Array. */
export function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/** Save secret key to localStorage (hex-encoded). */
export function saveSecretKey(sk) {
  localStorage.setItem(STORAGE_KEY.SECRET_KEY, bytesToHex(sk));
}

/** Load secret key from localStorage, returns Uint8Array or null. */
export function loadSecretKey() {
  const hex = localStorage.getItem(STORAGE_KEY.SECRET_KEY);
  if (!hex) return null;
  return hexToBytes(hex);
}

/**
 * Build and sign a Nostr event.
 * @param {Uint8Array} sk  — secret key
 * @param {object}     t   — event template { kind, tags, content, created_at? }
 * @returns {object} signed event with id and sig
 */
export function signEvent(sk, t) {
  const template = {
    kind: t.kind,
    tags: t.tags || [],
    content: t.content || '',
    created_at: t.created_at || Math.floor(Date.now() / 1000),
  };
  return NT.finalizeEvent(template, sk);
}

/**
 * NIP-44 encrypt.
 * @param {Uint8Array} sk              — our secret key
 * @param {string}     recipientPubkey — hex pubkey of recipient
 * @param {string}     plaintext
 * @returns {string} ciphertext
 */
export function nip44Encrypt(sk, recipientPubkey, plaintext) {
  const conversationKey = NT.nip44.v2.utils.getConversationKey(sk, recipientPubkey);
  return NT.nip44.v2.encrypt(plaintext, conversationKey);
}

/**
 * NIP-44 decrypt.
 * @param {Uint8Array} sk           — our secret key
 * @param {string}     senderPubkey — hex pubkey of sender
 * @param {string}     ciphertext
 * @returns {string} plaintext
 */
export function nip44Decrypt(sk, senderPubkey, ciphertext) {
  const conversationKey = NT.nip44.v2.utils.getConversationKey(sk, senderPubkey);
  return NT.nip44.v2.decrypt(ciphertext, conversationKey);
}

/**
 * Verify an event's id hash and schnorr signature.
 * @param {object} event — a signed Nostr event
 * @returns {boolean}
 */
export function verifyEvent(event) {
  try {
    return NT.verifyEvent ? NT.verifyEvent(event) : true;
  } catch {
    return false;
  }
}
