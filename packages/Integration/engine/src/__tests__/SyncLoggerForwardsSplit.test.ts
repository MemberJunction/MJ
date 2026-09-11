/**
 * The artifact stream is the ONLY place a finished run's per-entity created/updated split can be
 * recovered from: the run row records TotalRecords and nothing else.
 *
 * The canonical counts quartet folds created and updated into `succeeded`, so if this forwarding
 * stops carrying them in `data`, history silently loses the distinction plan.md requires
 * ("Synced is different between created and updated") and the breakdown goes blank again — with
 * no error anywhere, which is exactly how it stayed broken.
 */
import { describe, it, expect, vi } from 'vitest';
import { SyncLogger } from '../SyncLogger.js';

function capture() {
  const calls: Array<{ stage: string; counts?: Record<string, unknown>; data?: Record<string, unknown> }> = [];
  const emitter = {
    stageStart: vi.fn(),
    stageComplete: (stage: string, counts?: Record<string, unknown>, data?: Record<string, unknown>) =>
      calls.push({ stage, counts, data }),
    emit: vi.fn(),
    warning: vi.fn(),
  };
  const logger = new SyncLogger({ ciId: 'ci-1', integration: 'Test', runId: 'run-1' });
  logger.attachEmitter(emitter as never);
  return { logger, calls };
}

describe('SyncLogger mirrors an entity map completion into the artifact stream', () => {
  it('carries the created/updated split in data, not only the folded quartet', () => {
    const { logger, calls } = capture();
    logger.emit('sync.entity-map.complete', {
      externalObjectName: 'contacts', mjEntity: 'Contacts',
      recordsProcessed: 10, recordsCreated: 7, recordsUpdated: 3,
      recordsSkipped: 2, recordsErrored: 0,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].data).toMatchObject({ recordsCreated: 7, recordsUpdated: 3, mjEntity: 'Contacts' });
  });

  it('still reports the folded quartet the reader aggregates', () => {
    const { logger, calls } = capture();
    logger.emit('sync.entity-map.complete', {
      externalObjectName: 'contacts', recordsProcessed: 10,
      recordsCreated: 7, recordsUpdated: 3, recordsSkipped: 2, recordsErrored: 1,
    });
    // succeeded folds created+updated — that is the shape the run rollup depends on
    expect(calls[0].counts).toMatchObject({ processed: 10, succeeded: 10, failed: 1, skipped: 2 });
  });

  it('names the stage from the external object when no MJ entity is known', () => {
    const { logger, calls } = capture();
    logger.emit('sync.entity-map.complete', { externalObjectName: 'raw_object', recordsCreated: 1, recordsUpdated: 0 });
    expect(calls[0].stage).toBe('raw_object');
  });
});
