// The ETL example end to end: a sealed fact, a sealed decision, extraction
// that keeps rejections, stages that carry their batch, a receipt the ledger
// accepts for its batch and refuses for another.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newBatchId } from './boundary/batch.js';
import { extract } from './boundary/extract.js';
import { parseFileStatus } from './boundary/file-status.js';
import { load } from './effects/load.js';
import { emptyLedger, loadsOf, settle } from './ledger.js';
import { rowsOf } from './pipeline.js';
import { openRetry, retryOf } from './retry.js';
import { transform } from './steps/transform.js';

test('a parsed fact folds to a sealed decision, read through its opener', () => {
  const parsed = parseFileStatus({ file: 'f-1', stale: true });
  assert.equal(parsed.kind, 'accepted');
  if (parsed.kind !== 'accepted') return;
  assert.deepEqual(openRetry(retryOf(parsed.fact)), { kind: 'rebuild', file: 'f-1' });
});

test('a sparse legacy row parses to a total fact', () => {
  const parsed = parseFileStatus({});
  assert.equal(parsed.kind, 'accepted');
  if (parsed.kind === 'accepted') assert.deepEqual(openRetry(retryOf(parsed.fact)), { kind: 'reupload' });
});

test('the whole pipeline: extract keeps rejections, stages the rest, load returns a receipt the ledger accepts for its batch', async () => {
  const batch = newBatchId();
  const extraction = extract(batch, [{ id: 'a', value: ' x ' }, { id: 'b', value: 'y', extra: 1 }, { nope: true }]);
  assert.equal(extraction.kind, 'started');
  if (extraction.kind !== 'started') return;
  assert.equal(extraction.rejected.length, 2); // strict row schema: drift is a rejection, not a strip

  const rows = rowsOf(extraction.staged);
  assert.ok(Object.isFrozen(rows), 'the stage freezes its rows array');
  assert.ok(Object.isFrozen(rows[0]), 'the boundary freezes each parsed row');

  const receipt = await load(transform(extraction.staged));
  const settlement = settle(emptyLedger, batch, receipt);
  assert.equal(settlement.kind, 'settled');
  if (settlement.kind === 'settled') assert.deepEqual(loadsOf(settlement.ledger), [{ batch, written: 1 }]);
});

test('a receipt settles its batch once; a second settlement is a defect, not a second load', async () => {
  const batch = newBatchId();
  const extraction = extract(batch, [{ id: 'a', value: 'x' }]);
  if (extraction.kind !== 'started') throw new Error('fixture must start');
  const receipt = await load(transform(extraction.staged));
  const first = settle(emptyLedger, batch, receipt);
  assert.equal(first.kind, 'settled');
  if (first.kind !== 'settled') return;
  assert.throws(() => settle(first.ledger, batch, receipt), /not yet spent; this was/);
});

test('a receipt for one batch cannot settle another', async () => {
  const batch = newBatchId();
  const extraction = extract(batch, [{ id: 'a', value: 'x' }]);
  if (extraction.kind !== 'started') throw new Error('fixture must start');
  const receipt = await load(transform(extraction.staged));
  assert.equal(settle(emptyLedger, newBatchId(), receipt).kind, 'refused');
});

test('extract with nothing accepted is a named case, not an empty stage', () => {
  assert.equal(extract(newBatchId(), [{ nope: true }]).kind, 'nothing');
});
