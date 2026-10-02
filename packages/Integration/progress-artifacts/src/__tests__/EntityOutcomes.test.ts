/**
 * History could never show created vs updated vs skipped per table: the run ROW records only
 * TotalRecords, and EntityDetails existed on the API type but was never populated. That is the
 * empty breakdown thing.txt reports ("created shows just a plus, updated is just ~, breakdown,
 * nothing even showing up").
 *
 * The numbers do exist — a sync mirrors each entity map's completion into the artifact stream.
 * But the canonical counts quartet folds created and updated into `succeeded`, and plan.md needs
 * them apart ("Synced is different between created and updated"), so the split rides in `data`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntegrationProgressReader } from '../IntegrationProgressReader.js';

const ev = (stage: string, data: Record<string, unknown> | undefined, counts?: Record<string, number>) =>
  ({ eventType: 'stage.complete', stage, data, counts } as never);

function readerReturning(events: unknown[]) {
  const r = new IntegrationProgressReader('/nonexistent');
  vi.spyOn(r, 'Tail').mockResolvedValue(events as never);
  return r;
}

beforeEach(() => vi.restoreAllMocks());

describe('EntityOutcomes', () => {
  it('recovers the created/updated split the counts quartet folds away', async () => {
    const r = readerReturning([
      ev('Contacts', { mjEntity: 'Contacts', recordsCreated: 7, recordsUpdated: 3 },
         { processed: 10, succeeded: 10, failed: 0, skipped: 2 }),
    ]);
    const out = await r.EntityOutcomes('run-1');
    expect(out).toEqual([
      { EntityName: 'Contacts', InsertCount: 7, UpdateCount: 3, SkipCount: 2, ErrorCount: 0 },
    ]);
  });

  it('accumulates when a map completes twice in one run (resume, or a push pass)', async () => {
    const r = readerReturning([
      ev('Contacts', { mjEntity: 'Contacts', recordsCreated: 2, recordsUpdated: 0 }, { skipped: 1, failed: 0 } as never),
      ev('Contacts', { mjEntity: 'Contacts', recordsCreated: 3, recordsUpdated: 4 }, { skipped: 5, failed: 1 } as never),
    ]);
    const [row] = await r.EntityOutcomes('run-1');
    expect(row).toEqual({ EntityName: 'Contacts', InsertCount: 5, UpdateCount: 4, SkipCount: 6, ErrorCount: 1 });
  });

  it('ignores stage.complete events that are not entity-map completions', async () => {
    // RSU and discovery stages also emit stage.complete; they carry no created/updated split
    const r = readerReturning([
      ev('RunCodeGen', undefined, { processed: 1 } as never),
      ev('Contacts', { mjEntity: 'Contacts', recordsCreated: 1, recordsUpdated: 0 }, { skipped: 0, failed: 0 } as never),
    ]);
    const out = await r.EntityOutcomes('run-1');
    expect(out.map(o => o.EntityName)).toEqual(['Contacts']);
  });

  it('returns nothing for a pruned run, so the caller can say "not recorded" rather than zero', async () => {
    const r = readerReturning([]);
    expect(await r.EntityOutcomes('gone')).toEqual([]);
  });

  it('falls back to the stage name when the entity name is absent', async () => {
    const r = readerReturning([ev('raw_object', { recordsCreated: 1, recordsUpdated: 1 }, { skipped: 0, failed: 0 } as never)]);
    expect((await r.EntityOutcomes('run-1'))[0].EntityName).toBe('raw_object');
  });
});
