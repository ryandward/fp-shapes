// The entry point the queue runs. It composes the real effects, drives the
// core through them, says one thing about how the attempt ended, and clears
// this attempt's transfer report whatever happened. The log line is a fold
// over the status, written once in report.ts; every exit of the core reaches
// it. The run the interpreter returns carries the ledger and the ownership
// audit: a finished run with a receipt outstanding is a defect of the core
// (it dropped evidence it was issued), and a halted run names what was
// outstanding when the performer or the FFI threw; both are logged, and the
// defect is rethrown so the queue sees the attempt fail.

import type { IngestStatus, Outstanding } from '../boundary/ingest.ffi.js';
import { report } from '../report.js';
import { defect } from '../../../src/sealed.js';
import { fold, type Variant } from '../../../src/variant.js';
import { adapt } from './adapt.js';
import type { Foreign, LockIdentity } from './foreign.js';
import { drive, type Entry, type Run } from './ingest.drive.js';

export type IngestJob = {
  readonly fileId: string;
  readonly signal: AbortSignal;
  readonly lock: LockIdentity;
  readonly attempt: number;
  readonly maxAttempts: number;
};

export type Finished = {
  readonly status: Variant<IngestStatus>;
  readonly ledger: ReadonlyArray<Variant<Entry>>;
};

const outstandingNames = (outstanding: ReadonlyArray<Variant<Outstanding>>): ReadonlyArray<string> => outstanding.map((o) => o.kind);

export const runExternalIngest =
  (foreign: Foreign) =>
  async (job: IngestJob): Promise<Finished> => {
    const startedAt = Date.now();
    const line = (action: string, detail: string, commands: number, outstanding: ReadonlyArray<string>): string =>
      JSON.stringify({
        tag: '[INGEST]',
        action,
        fileId: job.fileId,
        attempt: job.attempt,
        maxAttempts: job.maxAttempts,
        detail,
        commands,
        outstanding,
        elapsedMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      });
    try {
      const run = await drive(adapt(foreign, { lock: job.lock, signal: job.signal }))(job.fileId);
      return fold<Run, Finished>({
        finished: ({ status, ledger, outstanding }) => {
          const { action, severity, detail } = report(status);
          const names = outstandingNames(outstanding);
          console[severity](line(action, detail, ledger.length, names));
          return names.length === 0 ? { status, ledger } : defect(`the attempt finished with evidence outstanding: ${names.join(', ')}`);
        },
        halted: ({ error, ledger, outstanding }) => {
          const names = outstandingNames(outstanding);
          console.error(line('halted', error.message, ledger.length, names));
          throw error;
        },
      })(run);
    } finally {
      // Conditional on the lock inside clearTransfer, so a straggler cannot
      // erase the report of its replacement.
      foreign.clearTransfer(job.fileId, job.lock);
    }
  };
