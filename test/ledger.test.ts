// The append-only builder: entries come back in order, as a frozen copy, and
// a copy handed out earlier does not change when more is noted.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ledger } from '../src/ledger.js';

test('entries are read back in the order noted, frozen, and note returns its entry', () => {
  const l = ledger<{ readonly n: number }>();
  const first = { n: 1 };
  assert.equal(l.note(first), first);
  l.note({ n: 2 });
  const read = l.entries();
  assert.deepEqual(read, [{ n: 1 }, { n: 2 }]);
  assert.ok(Object.isFrozen(read));
  l.note({ n: 3 });
  assert.deepEqual(read, [{ n: 1 }, { n: 2 }]); // the earlier copy is what it was
  assert.deepEqual(l.entries(), [{ n: 1 }, { n: 2 }, { n: 3 }]);
});

test('an empty ledger reads as an empty frozen array', () => {
  const read = ledger<number>().entries();
  assert.deepEqual(read, []);
  assert.ok(Object.isFrozen(read));
});
