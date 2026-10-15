// -----------------------------------------------------------------------------
// When the store is read: 4 times a day, right after each switch, and after
// a failure on a backoff that never turns into a busy loop.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MINUTE_MS, REGULAR_MS, nextRefreshAt } from '../src/schedule.js';

const T = Date.parse('2026-10-15T08:00:00Z');
const SWITCH = Date.parse('2026-10-15T15:00:00Z');

test('never read yet: now', () => {
  assert.equal(
    nextRefreshAt({
      now: T,
      lastSuccessAt: null,
      lastAttemptAt: null,
      failures: 0,
      boundaries: [],
    }),
    T,
  );
});

test('every 6 hours without a switch in sight', () => {
  assert.equal(
    nextRefreshAt({ now: T, lastSuccessAt: T, lastAttemptAt: T, failures: 0, boundaries: [] }),
    T + REGULAR_MS,
  );
});

test('2 minutes, then 30 minutes after a switch', () => {
  const state = { lastSuccessAt: T + 6 * 60 * MINUTE_MS, failures: 0, boundaries: [SWITCH] };
  state.lastAttemptAt = state.lastSuccessAt;
  assert.equal(nextRefreshAt({ ...state, now: state.lastSuccessAt }), SWITCH + 2 * MINUTE_MS);
  const after = SWITCH + 2 * MINUTE_MS;
  assert.equal(
    nextRefreshAt({ ...state, now: after, lastSuccessAt: after, lastAttemptAt: after }),
    SWITCH + 30 * MINUTE_MS,
  );
  const later = SWITCH + 30 * MINUTE_MS;
  assert.equal(
    nextRefreshAt({ ...state, now: later, lastSuccessAt: later, lastAttemptAt: later }),
    later + REGULAR_MS,
  );
});

test('after a failure: 5, 15, 30, then 60 minutes', () => {
  const base = { lastSuccessAt: T, boundaries: [] };
  const attempt = T + REGULAR_MS;
  for (const [failures, minutes] of [
    [1, 5],
    [2, 15],
    [3, 30],
    [4, 60],
    [9, 60],
  ]) {
    assert.equal(
      nextRefreshAt({ ...base, now: attempt, lastAttemptAt: attempt, failures }),
      attempt + minutes * MINUTE_MS,
      `${failures} failure(s)`,
    );
  }
});

test('a switch slot that failed is not retried in a loop', () => {
  const attempt = SWITCH + 2 * MINUTE_MS;
  const next = nextRefreshAt({
    now: attempt + 1000,
    lastSuccessAt: T,
    lastAttemptAt: attempt,
    failures: 1,
    boundaries: [SWITCH],
  });
  assert.equal(next, attempt + 5 * MINUTE_MS);
});

test('never in the past', () => {
  const now = T + 10 * REGULAR_MS;
  assert.equal(
    nextRefreshAt({ now, lastSuccessAt: T, lastAttemptAt: T, failures: 0, boundaries: [] }),
    now,
  );
});
