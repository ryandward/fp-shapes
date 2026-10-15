// The entry point the queue runs. It composes the real effects, runs the
// worker, says one thing about how the attempt ended, and clears this
// attempt's transfer report whatever happened. The log line is a fold over
// the status, written once in report.ts; every exit of the worker reaches it.

import { report } from '../report.js';
import type { IngestStatus } from '../status.js';
import { ingest } from '../worker.js';
import { adapt } from './adapt.js';
import type { Foreign, LockIdentity } from './foreign.js';

export type IngestJob = {
  readonly fileId: string;
  readonly signal: AbortSignal;
  readonly lock: LockIdentity;
  readonly attempt: number;
  readonly maxAttempts: number;
};

export const runExternalIngest = (foreign: Foreign): ((job: IngestJob) => Promise<IngestStatus>) => {
  const run = ingest(adapt(foreign));
  return async (job) => {
    const startedAt = Date.now();
    try {
      const status = await run({ fileId: job.fileId, signal: job.signal, lock: job.lock });
      const { action, severity, detail } = report(status);
      console[severity](
        JSON.stringify({
          tag: '[INGEST]',
          action,
          fileId: job.fileId,
          attempt: job.attempt,
          maxAttempts: job.maxAttempts,
          detail,
          elapsedMs: Date.now() - startedAt,
          timestamp: new Date().toISOString(),
        }),
      );
      return status;
    } finally {
      // Conditional on the lock inside clearTransfer, so a straggler cannot
      // erase the report of its replacement.
      foreign.clearTransfer(job.fileId, job.lock);
    }
  };
};
