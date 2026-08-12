// js/bech32.js — Minimal bech32 decoder for custom prefixes
//
// nostr-tools can *encode* an arbitrary prefix via nip19.encodeBytes, but its
// nip19.decode() throws on any prefix it doesn't know — including 'nrvrelay'.
// The bundle also doesn't re-export its internal bech32 helper, so decoding a
// custom prefix needs this small standalone implementation.

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
const MAX_LENGTH = 5000; // matches nostr-tools' Bech32MaxSize

function polymod(values) {
  let chk = 1;
  for (const v of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) {
      if ((top >> i) & 1) chk ^= GENERATOR[i];
    }
  }
  return chk;
}

function hrpExpand(hrp) {
  const out = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

/** Convert 5-bit words to 8-bit bytes. */
function wordsToBytes(words) {
  let acc = 0;
  let bits = 0;
  const out = [];
  for (const word of words) {
    acc = (acc << 5) | word;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  if (bits >= 5 || ((acc << (8 - bits)) & 0xff) !== 0) {
    throw new Error('Invalid bech32 padding');
  }
  return new Uint8Array(out);
}

/**
 * Decode a bech32 string into its prefix and payload bytes.
 * @returns {{ prefix: string, bytes: Uint8Array }}
 */
export function decodeToBytes(str) {
  if (typeof str !== 'string') throw new Error('bech32 input must be a string');
  if (str.length < 8 || str.length > MAX_LENGTH) {
    throw new Error(`Invalid bech32 length: ${str.length}`);
  }

  const lower = str.toLowerCase();
  if (str !== lower && str !== str.toUpperCase()) {
    throw new Error('bech32 string must be all lowercase or all uppercase');
  }

  const split = lower.lastIndexOf('1');
  if (split < 1 || split + 7 > lower.length) {
    throw new Error('Invalid bech32 separator position');
  }

  const prefix = lower.slice(0, split);
  const dataPart = lower.slice(split + 1);

  const words = [];
  for (const ch of dataPart) {
    const idx = CHARSET.indexOf(ch);
    if (idx === -1) throw new Error(`Invalid bech32 character: ${ch}`);
    words.push(idx);
  }

  if (polymod(hrpExpand(prefix).concat(words)) !== 1) {
    throw new Error('Invalid bech32 checksum');
  }

  return { prefix, bytes: wordsToBytes(words.slice(0, -6)) };
}
