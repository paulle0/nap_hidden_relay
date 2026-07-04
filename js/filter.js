/**
 * NNS Hidden Relay — NIP-01 filter matching
 * Extracted for reuse by relay-handler and future modules.
 */

/**
 * Check whether a single event matches a single NIP-01 filter.
 * @param {object} event  — a Nostr event
 * @param {object} filter — a NIP-01 filter object
 * @returns {boolean}
 */
export function matchFilter(event, filter) {
  if (filter.ids && !filter.ids.includes(event.id)) return false;
  if (filter.authors && !filter.authors.includes(event.pubkey)) return false;
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
  if (filter.since && event.created_at < filter.since) return false;
  if (filter.until && event.created_at > filter.until) return false;

  // Tag filters (#e, #p, etc.)
  for (const [key, vals] of Object.entries(filter)) {
    if (!key.startsWith('#') || !Array.isArray(vals)) continue;
    const tagName = key.slice(1);
    const eventTagVals = event.tags
      .filter(t => t[0] === tagName)
      .map(t => t[1]);
    if (!vals.some(v => eventTagVals.includes(v))) return false;
  }
  return true;
}

/**
 * Query a set of events against one or more NIP-01 filters,
 * respecting the `limit` field on each filter.
 *
 * Events MUST be pre-sorted newest-first (descending created_at).
 *
 * @param {object[]} events  — array of Nostr events, newest first
 * @param {object[]} filters — array of NIP-01 filter objects
 * @returns {object[]} matching events (de-duplicated)
 */
export function queryEvents(events, filters) {
  const seen = new Set();
  const matched = [];
  const limits = filters.map(f => f.limit ?? Infinity);
  const counts = filters.map(() => 0);

  for (const ev of events) {
    if (seen.has(ev.id)) continue;

    for (let i = 0; i < filters.length; i++) {
      if (counts[i] >= limits[i]) continue;
      if (matchFilter(ev, filters[i])) {
        matched.push(ev);
        seen.add(ev.id);
        counts[i]++;
        break; // event matched one filter, move on to next event
      }
    }
  }
  return matched;
}
