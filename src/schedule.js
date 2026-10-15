// -----------------------------------------------------------------------------
// When to read the store again.
//
// The offers change once a week (Thursday, 17:00 Paris time), every day
// during the Christmas giveaway, and the answer gives the exact instants:
// the start and the end of every offer. So the store is read:
//   - every 6 hours, four times a day, whatever happens (a lineup Epic adds
//     or changes between two switches);
//   - 2 minutes after a switch, then 30 minutes after it (the CDN answer can
//     lag the switch, and a mystery game is revealed a little later);
//   - after a failure, again in 5, 15, 30 then 60 minutes, never later than
//     the regular pace.
// That is 6 to 8 requests a day to a public, CDN-served endpoint.
// -----------------------------------------------------------------------------

export const MINUTE_MS = 60_000;
export const REGULAR_MS = 6 * 60 * MINUTE_MS;
export const AFTER_SWITCH_MS = [2 * MINUTE_MS, 30 * MINUTE_MS];
export const RETRY_MS = [5, 15, 30, 60].map((minutes) => minutes * MINUTE_MS);

/**
 * The next instant to read the store at.
 * @param {object} state
 * @param {number} state.now epoch ms
 * @param {number|null} state.lastSuccessAt last successful read, null when none yet
 * @param {number} state.failures consecutive failed reads since the last success
 * @param {number|null} state.lastAttemptAt last read, successful or not
 * @param {number[]} state.boundaries starts and ends of the offers (epoch ms)
 * @returns {number} epoch ms, never in the past
 */
export function nextRefreshAt({ now, lastSuccessAt, failures, lastAttemptAt, boundaries }) {
  if (lastSuccessAt === null && failures === 0) {
    return now;
  }
  const candidates = [];
  if (failures > 0) {
    const delay = RETRY_MS[Math.min(failures, RETRY_MS.length) - 1];
    candidates.push((lastAttemptAt ?? now) + Math.min(delay, REGULAR_MS));
  }
  if (lastSuccessAt !== null) {
    // After a failure, the retry delays replace the regular pace.
    if (failures === 0) {
      candidates.push(lastSuccessAt + REGULAR_MS);
    }
    // A slot a read already tried (successful or not) is done: a failure
    // falls back on the retry delays, never on a busy loop.
    const done = Math.max(lastSuccessAt, lastAttemptAt ?? lastSuccessAt);
    for (const boundary of boundaries) {
      for (const delay of AFTER_SWITCH_MS) {
        const at = boundary + delay;
        if (at > done) {
          candidates.push(at);
        }
      }
    }
  }
  return Math.max(now, Math.min(...candidates));
}
