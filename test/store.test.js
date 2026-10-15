// -----------------------------------------------------------------------------
// Persistence under /data: atomic writes, a missing or broken file is empty.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';

process.env.LOG_LEVEL ??= 'silent';

test('saves and loads the announced games', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'gladys-epic-'));
  const store = new Store(directory);
  assert.deepEqual(await store.load(), {});
  await store.save({ seeded: true, announced: { a: 1 } });
  await store.save({ seeded: true, announced: { a: 1, b: 2 } });
  await store.flush();
  assert.deepEqual(JSON.parse(readFileSync(join(directory, 'epic-games-state.json'), 'utf8')), {
    seeded: true,
    announced: { a: 1, b: 2 },
  });
  assert.deepEqual(await new Store(directory).load(), { seeded: true, announced: { a: 1, b: 2 } });
});

test('a broken file reads as empty', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'gladys-epic-'));
  writeFileSync(join(directory, 'epic-games-state.json'), '{ not json');
  assert.deepEqual(await new Store(directory).load(), {});
});

test('a /data that cannot be written does not throw', async () => {
  // A directory under a regular file: every write fails (ENOTDIR).
  const file = join(mkdtempSync(join(tmpdir(), 'gladys-epic-')), 'a-file');
  writeFileSync(file, '');
  const store = new Store(join(file, 'data'));
  await store.save({ seeded: true });
  await store.flush();
  assert.ok(store.issues.isFailing('write'));
});
