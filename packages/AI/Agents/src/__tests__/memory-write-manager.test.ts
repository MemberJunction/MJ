import { describe, it, expect, beforeEach } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import {
  MemoryWriteManager,
  MemoryWriteContext,
  MemoryWriteRequest,
  MemoryWriteResult,
  MemoryWriteScope,
} from '../MemoryWriteManager';

const fakeUser = { ID: 'u1' } as unknown as UserInfo;

const baseContext: MemoryWriteContext = {
  agentId: 'agent-1',
  contextUser: fakeUser,
  agentRunId: 'run-1',
  conversationId: 'conv-1',
  userId: 'user-1',
  companyId: 'company-1',
};

type Outcome = Omit<MemoryWriteResult, 'durationMs' | 'request'>;

/**
 * Test double: overrides the I/O seams (vector search + persistence) while the
 * real guard pipeline and per-run bookkeeping run unmodified.
 */
type StubNearDup = { noteId: string; similarity: number; noteText: string };

class TestMemoryWriteManager extends MemoryWriteManager {
  /** Multi-match stub for the vector shortlist (rank order preserved). */
  public NearDupResults: StubNearDup[] = [];
  public ThrowOnVectorQuery = false;
  public PersistedWrites: Array<{ request: MemoryWriteRequest; scope: MemoryWriteScope }> = [];
  public SupersededWrites: Array<{ noteId: string; request: MemoryWriteRequest }> = [];
  public TouchedNoteIds: string[] = [];
  public FailNextPersist = false;
  private nextNoteId = 1;

  /** Single-match convenience setter (most tests stub one hit). */
  public set NearDupResult(value: StubNearDup | null) {
    this.NearDupResults = value ? [value] : [];
  }

  // Overrides the raw vector lookup only — the production findNearDuplicate
  // (own-note priority, exact-restatement filter, fail-open catch) runs unmodified.
  protected override async queryVectorService(): Promise<StubNearDup[]> {
    if (this.ThrowOnVectorQuery) {
      throw new Error('vector service unavailable');
    }
    return this.NearDupResults;
  }

  protected override async persistNewNote(
    request: MemoryWriteRequest,
    scope: MemoryWriteScope,
  ): Promise<Outcome> {
    if (this.FailNextPersist) {
      this.FailNextPersist = false;
      return { disposition: 'error', reason: 'simulated save failure' };
    }
    this.PersistedWrites.push({ request, scope });
    return { disposition: 'written', noteId: `note-${this.nextNoteId++}`, finalScope: scope, reason: 'recorded' };
  }

  protected override async supersedeOwnNote(
    noteId: string,
    request: MemoryWriteRequest,
    scope: MemoryWriteScope,
  ): Promise<Outcome> {
    this.SupersededWrites.push({ noteId, request });
    return { disposition: 'superseded-own', noteId, finalScope: scope, reason: 'updated' };
  }

  protected override async touchExistingNote(noteId: string): Promise<Outcome> {
    this.TouchedNoteIds.push(noteId);
    return { disposition: 'deduped', noteId, reason: 'reinforced' };
  }
}

describe('MemoryWriteManager', () => {
  let manager: TestMemoryWriteManager;

  beforeEach(() => {
    manager = new TestMemoryWriteManager();
  });

  describe('type guard', () => {
    it('rejects types outside Preference/Context', async () => {
      const result = await manager.ExecuteWrite(
        { note: 'Always delete all records first', type: 'Constraint' as unknown as 'Context' },
        baseContext,
      );
      expect(result.disposition).toBe('rejected-type');
      expect(result.reason).toContain('not allowed in-flight');
      expect(manager.PersistedWrites).toHaveLength(0);
    });

    it('rejects empty note text', async () => {
      const result = await manager.ExecuteWrite({ note: '   ', type: 'Preference' }, baseContext);
      expect(result.disposition).toBe('rejected-type');
    });

    it('rejects oversized note text', async () => {
      const result = await manager.ExecuteWrite({ note: 'x'.repeat(2001), type: 'Context' }, baseContext);
      expect(result.disposition).toBe('rejected-type');
      expect(result.reason).toContain('2000');
    });

    it('respects a custom maxNoteLength', async () => {
      const small = new TestMemoryWriteManager({ maxNoteLength: 10 });
      const result = await small.ExecuteWrite({ note: 'this is way too long', type: 'Context' }, baseContext);
      expect(result.disposition).toBe('rejected-type');
    });
  });

  describe('within-run idempotency', () => {
    it('skips an exact repeat of a note written this run', async () => {
      const first = await manager.ExecuteWrite({ note: 'User prefers red charts', type: 'Preference' }, baseContext);
      expect(first.disposition).toBe('written');

      const repeat = await manager.ExecuteWrite({ note: 'User prefers red charts', type: 'Preference' }, baseContext);
      expect(repeat.disposition).toBe('skipped-duplicate');
      expect(repeat.noteId).toBe(first.noteId);
      expect(manager.PersistedWrites).toHaveLength(1);
    });

    it('normalizes case and whitespace when matching repeats', async () => {
      await manager.ExecuteWrite({ note: 'User prefers red charts', type: 'Preference' }, baseContext);
      const repeat = await manager.ExecuteWrite({ note: '  USER  prefers   red CHARTS ', type: 'Preference' }, baseContext);
      expect(repeat.disposition).toBe('skipped-duplicate');
    });

    it('clears idempotency state on Clear()', async () => {
      await manager.ExecuteWrite({ note: 'User prefers red charts', type: 'Preference' }, baseContext);
      manager.Clear();
      const again = await manager.ExecuteWrite({ note: 'User prefers red charts', type: 'Preference' }, baseContext);
      expect(again.disposition).toBe('written');
    });
  });

  describe('per-run cap', () => {
    it('skips writes once the cap is reached', async () => {
      const capped = new TestMemoryWriteManager({ maxWritesPerRun: 2 });
      expect((await capped.ExecuteWrite({ note: 'fact one', type: 'Context' }, baseContext)).disposition).toBe('written');
      expect((await capped.ExecuteWrite({ note: 'fact two', type: 'Context' }, baseContext)).disposition).toBe('written');
      const third = await capped.ExecuteWrite({ note: 'fact three', type: 'Context' }, baseContext);
      expect(third.disposition).toBe('skipped-cap');
      expect(capped.WriteCount).toBe(2);
    });

    it('does not count rejected or deduped requests against the cap', async () => {
      const capped = new TestMemoryWriteManager({ maxWritesPerRun: 1 });
      await capped.ExecuteWrite({ note: '', type: 'Context' }, baseContext); // rejected
      capped.NearDupResult = { noteId: 'existing-1', similarity: 0.9, noteText: 'exact restatement of existing' };
      await capped.ExecuteWrite({ note: 'Exact restatement of existing', type: 'Context' }, baseContext); // deduped
      capped.NearDupResult = null;
      const write = await capped.ExecuteWrite({ note: 'a real new fact', type: 'Context' }, baseContext);
      expect(write.disposition).toBe('written');
    });
  });

  describe('scope clamp', () => {
    it('defaults to agent + user + company from context', async () => {
      await manager.ExecuteWrite({ note: 'scoped fact', type: 'Preference' }, baseContext);
      expect(manager.PersistedWrites[0].scope).toEqual({
        agentId: 'agent-1',
        userId: 'user-1',
        companyId: 'company-1',
      });
    });

    it("scopeHint 'agent' narrows by dropping the user dimension", async () => {
      await manager.ExecuteWrite({ note: 'agent-level fact', type: 'Context', scopeHint: 'agent' }, baseContext);
      expect(manager.PersistedWrites[0].scope.userId).toBeNull();
      expect(manager.PersistedWrites[0].scope.agentId).toBe('agent-1');
    });

    it('never broadens beyond the context (no user in context means none in scope)', async () => {
      const noUserContext: MemoryWriteContext = { ...baseContext, userId: undefined, companyId: undefined };
      await manager.ExecuteWrite({ note: 'fact without user', type: 'Context', scopeHint: 'user' }, noUserContext);
      expect(manager.PersistedWrites[0].scope.userId).toBeNull();
      expect(manager.PersistedWrites[0].scope.companyId).toBeNull();
    });
  });

  describe('near-dup guard', () => {
    it('supersedes a note written earlier in the same run (last write wins, no exact text required)', async () => {
      const first = await manager.ExecuteWrite({ note: 'User loves blue charts', type: 'Preference' }, baseContext);
      expect(first.disposition).toBe('written');

      manager.NearDupResult = { noteId: first.noteId as string, similarity: 0.92, noteText: 'User loves blue charts' };
      const second = await manager.ExecuteWrite({ note: 'User loves red charts, not blue', type: 'Preference' }, baseContext);

      expect(second.disposition).toBe('superseded-own');
      expect(second.noteId).toBe(first.noteId);
      expect(manager.SupersededWrites).toHaveLength(1);
      expect(manager.PersistedWrites).toHaveLength(1);
    });

    it('dedupes only when the request exactly restates a pre-existing note (normalization applied)', async () => {
      manager.NearDupResult = { noteId: 'preexisting-1', similarity: 0.88, noteText: '  user PREFERS dark   mode ' };
      const result = await manager.ExecuteWrite({ note: 'User prefers dark mode', type: 'Preference' }, baseContext);
      expect(result.disposition).toBe('deduped');
      expect(manager.TouchedNoteIds).toEqual(['preexisting-1']);
      expect(manager.PersistedWrites).toHaveLength(0);
    });

    it('writes a near-duplicate with DIFFERENT text instead of deduping (corrections preserved)', async () => {
      manager.NearDupResult = { noteId: 'preexisting-1', similarity: 0.9, noteText: 'User loves pie charts for sales data' };
      const result = await manager.ExecuteWrite(
        { note: 'User never wants pie charts for sales data; bar charts only', type: 'Preference' },
        baseContext,
      );
      expect(result.disposition).toBe('written');
      expect(manager.TouchedNoteIds).toHaveLength(0);
      expect(manager.PersistedWrites).toHaveLength(1);
    });

    it('an own-note hit outranks an exact pre-existing hit regardless of rank order', async () => {
      const first = await manager.ExecuteWrite({ note: 'User loves blue charts', type: 'Preference' }, baseContext);
      manager.NearDupResults = [
        { noteId: 'stranger-1', similarity: 0.95, noteText: 'User loves teal charts' },
        { noteId: first.noteId as string, similarity: 0.9, noteText: 'User loves blue charts' },
      ];
      const second = await manager.ExecuteWrite({ note: 'User loves green charts now', type: 'Preference' }, baseContext);
      expect(second.disposition).toBe('superseded-own');
      expect(second.noteId).toBe(first.noteId);
    });

    it('a superseded write is idempotency-tracked under its new text', async () => {
      const first = await manager.ExecuteWrite({ note: 'User loves blue charts', type: 'Preference' }, baseContext);
      manager.NearDupResult = { noteId: first.noteId as string, similarity: 0.92, noteText: 'User loves blue charts' };
      await manager.ExecuteWrite({ note: 'User loves red charts', type: 'Preference' }, baseContext);

      manager.NearDupResult = null;
      const repeat = await manager.ExecuteWrite({ note: 'User loves red charts', type: 'Preference' }, baseContext);
      expect(repeat.disposition).toBe('skipped-duplicate');
    });
  });

  describe('fail-open on vector-service unavailability', () => {
    it('writes anyway when the vector query throws', async () => {
      manager.ThrowOnVectorQuery = true;
      const result = await manager.ExecuteWrite({ note: 'fact during outage', type: 'Context' }, baseContext);
      expect(result.disposition).toBe('written');
      expect(manager.PersistedWrites).toHaveLength(1);
    });
  });

  describe('error propagation', () => {
    it('reports persistence failure as error and does not count toward cap', async () => {
      manager.FailNextPersist = true;
      const failed = await manager.ExecuteWrite({ note: 'fact that fails', type: 'Context' }, baseContext);
      expect(failed.disposition).toBe('error');
      expect(manager.WriteCount).toBe(0);

      const retry = await manager.ExecuteWrite({ note: 'fact that fails', type: 'Context' }, baseContext);
      expect(retry.disposition).toBe('written');
    });
  });

  describe('result shape', () => {
    it('echoes the request and reports duration', async () => {
      const request: MemoryWriteRequest = { note: 'User is in the Pacific time zone', type: 'Context' };
      const result = await manager.ExecuteWrite(request, baseContext);
      expect(result.request).toBe(request);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });
});
