/**
 * Score Record Set's scope resolution and refusals (Task M5.6, replacing the write-back runner's scope tests): every
 * wire selector resolves to a scoring scope of bare keys, a capped filter refuses a larger match, a full filter read is
 * never cut at the entity's row cap, and a model that may not score is refused before its scope is read, writing no
 * Feature Value.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RunView, type RunViewParams } from '@memberjunction/core';

import { ProductionScoreRecordSetRunner } from '../score-record-set.runner';
import type { ScoreRecordSetRequest } from '../score-record-set.action';
import { ScoringRefusedError } from '../../scoring/scoring-refused-error';
import { ReadCapExceededError } from '../../feature-assembly/read-cap-error';
import { MEMBERSHIPS, MEMBERSHIPS_ID, ScoringServiceWorld, type WorldModelRef } from '../../__tests__/fakes/scoring-service-world';

let world: ScoringServiceWorld;

beforeEach(() => {
  world = new ScoringServiceWorld();
});

/** The model's pipeline scores Memberships. */
function scoresMemberships(model: WorldModelRef): void {
  Object.assign(world.Store.Row('MJ: ML Training Pipelines', model.PipelineID) || {}, { TargetEntityID: MEMBERSHIPS_ID, TargetEntity: MEMBERSHIPS });
}

/** A Published model of a pipeline that scores Memberships. */
function published(): WorldModelRef {
  const model = world.Model();
  scoresMemberships(model);
  return model;
}

/** Runs the request through the runner with the world's seams. */
function run(request: Omit<ScoreRecordSetRequest, 'contextUser' | 'provider'>) {
  return new ProductionScoreRecordSetRunner({ seams: world.Ctx().Seams }).run({ ...request, contextUser: ScoringServiceWorld.User, provider: world.Provider });
}

/** The reads of the target entity, as RunView params. */
function targetReads(): RunViewParams[] {
  // the world provider's RunView (a vi.fn), typed through the RunView seam the runner reads with
  const calls = vi.mocked(RunView.FromMetadataProvider(world.Provider).ProviderToUse.RunView).mock.calls;
  return calls.map(([params]) => params).filter((p) => p.EntityName === MEMBERSHIPS);
}

/** The newest scoring run's stored scope. */
function lastScope(): Record<string, string | string[]> {
  const runs = world.Runs();
  return JSON.parse(String(runs[runs.length - 1]['Scope']));
}

describe('Score Record Set — the scope', () => {
  it('records given as bare keys, Field|value segments and primary-key objects all score by their bare key', async () => {
    const out = await run({ modelId: published().ID, scope: { records: ['r1', 'ID|r2', { ID: 'r3' }, { id: 'r4' }] } });
    expect(out.Predictions.map((p) => p.recordId)).toEqual(['r1', 'r2', 'r3', 'r4']);
    expect(lastScope()).toEqual({ kind: 'record-ids', entity: MEMBERSHIPS, ids: ['r1', 'r2', 'r3', 'r4'] });
  });

  it('a single record scores its key; a key that is not the primary key is refused by name', async () => {
    const model = published();
    const out = await run({ modelId: model.ID, scope: { single: { entityName: MEMBERSHIPS, primaryKey: { ID: 's1' } } } });
    expect(out.Predictions.map((p) => p.recordId)).toEqual(['s1']);
    await expect(run({ modelId: model.ID, scope: { single: { entityName: MEMBERSHIPS, primaryKey: { Score: '1' } } } })).rejects.toThrow(/'Score', not the primary key 'ID'/);
  });

  it('a filter with no maxRows reads every matching key, never cut at the entity row cap', async () => {
    await run({ modelId: published().ID, scope: { filter: { entityName: MEMBERSHIPS, extraFilter: "ID IN ('a','b')" } } });
    expect(lastScope()).toEqual({ kind: 'filter', entity: MEMBERSHIPS, extraFilter: "ID IN ('a','b')" });
    const scopeRead = targetReads().find((p) => p.Fields?.length === 1);
    expect(scopeRead?.IgnoreMaxRows).toBe(true);
  });

  it('a filter whose match is larger than its explicit maxRows is refused, with no run row written', async () => {
    const error = await run({ modelId: published().ID, scope: { filter: { entityName: MEMBERSHIPS, extraFilter: "ID IN ('a','b','c')", maxRows: 2 } } }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(ReadCapExceededError);
    expect(world.Runs()).toHaveLength(0);
  });

  it('a list scores its members by their bare key over the list\'s entity', async () => {
    const listId = 'A0000000-0000-4000-8000-0000000009A1';
    world.Store.Insert('MJ: Lists', { ID: listId, EntityID: MEMBERSHIPS_ID });
    world.Store.Insert('MJ: List Details', { ID: 'A0000000-0000-4000-8000-0000000009B1', ListID: listId, RecordID: 'l1' });
    world.Store.Insert('MJ: List Details', { ID: 'A0000000-0000-4000-8000-0000000009B2', ListID: listId, RecordID: 'ID|l2' });
    const out = await run({ modelId: published().ID, scope: { listId } });
    expect(out.Predictions.map((p) => p.recordId)).toEqual(['l1', 'l2']);
  });

  it('refuses a listId, viewId or modelId that is not a UUID before reading anything', async () => {
    await expect(run({ modelId: published().ID, scope: { listId: "x' OR 1=1 --" } })).rejects.toThrow(/scope.listId/);
    await expect(run({ modelId: published().ID, scope: { viewId: 'not-a-uuid' } })).rejects.toThrow(/scope.viewId/);
    await expect(run({ modelId: 'not-a-uuid', scope: { records: ['r1'] } })).rejects.toThrow(/modelId/);
  });
});

describe('Score Record Set — a model that may not score', () => {
  for (const status of ['Draft', 'Validated', 'Archived'] as const) {
    it(`a ${status} model is refused model-not-published before its scope is read, writing nothing`, async () => {
      const model = world.Model({ Status: status });
      scoresMemberships(model);
      const error = await run({ modelId: model.ID, scope: { filter: { entityName: MEMBERSHIPS, extraFilter: "ID IN ('r1')" } } }).catch((e: Error) => e);
      expect(error).toBeInstanceOf(ScoringRefusedError);
      expect(error instanceof ScoringRefusedError ? error.Result : null).toMatchObject({ Status: 'refused', Reason: { kind: 'model-not-published', status } });
      expect(targetReads()).toHaveLength(0);
      expect(world.Values.Calls()).toHaveLength(0);
    });
  }

  it('a model that does not exist needs training', async () => {
    await expect(run({ modelId: 'A0000000-0000-4000-8000-00000000FFFF', scope: { records: ['r1'] } })).rejects.toThrow(/not found/);
  });
});
