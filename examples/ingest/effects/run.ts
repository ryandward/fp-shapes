// The entry point the queue runs. It composes the real effects, drives the
// core through them, says one thing about how the attempt ended, and clears
// this attempt's transfer report whatever happened. The log line is a fold
// over the status, written once in report.ts; every exit of the core reaches
// it. The ledger the interpreter kept is returned with the status, so the
// queue can record what the attempt did.

import type { IngestStatus } from '../boundary/ingest.ffi.js';
import { report } from '../report.js';
import type { Variant } from '../../../src/variant.js';
import { adapt } from './adapt.js';
import type { Foreign, LockIdentity } from './foreign.js';
import { drive, type Run } from './ingest.drive.js';

export type IngestJob = {
  readonly fileId: string;
  readonly signal: AbortSignal;
  readonly lock: LockIdentity;
  readonly attempt: number;
  readonly maxAttempts: number;
};

export const runExternalIngest =
  (foreign: Foreign) =>
  async (job: IngestJob): Promise<Run> => {
    const startedAt = Date.now();
    try {
      const run = await drive(adapt(foreign, { lock: job.lock, signal: job.signal }))(job.fileId);
      const status: Variant<IngestStatus> = run.status;
      const { action, severity, detail } = report(status);
      console[severity](
        JSON.stringify({
          tag: '[INGEST]',
          action,
          fileId: job.fileId,
          attempt: job.attempt,
          maxAttempts: job.maxAttempts,
          detail,
          commands: run.ledger.length,
          elapsedMs: Date.now() - startedAt,
          timestamp: new Date().toISOString(),
        }),
      );
      return run;
    } finally {
      // Conditional on the lock inside clearTransfer, so a straggler cannot
      // erase the report of its replacement.
      foreign.clearTransfer(job.fileId, job.lock);
    }
  };
