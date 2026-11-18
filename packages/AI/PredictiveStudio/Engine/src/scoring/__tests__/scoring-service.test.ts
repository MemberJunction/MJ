import { describe, it, expect, beforeEach } from 'vitest';
import type { MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';

import { ScoringService } from '../scoring-service';
import { ScoringBindings } from '../scoring-binding';
import { ModelNeedsTrainingError } from '../model-readiness';
import {
  AdverseOf, BATCH, ProbabilityOf, RUN_DATE, Records, ScoringServiceWorld, ThreeBatches, ValueOf, type WorldModelOptions, type WorldModelRef,
} from '../../__tests__/fakes/scoring-service-world';
import { ConsoleCapture } from '../../__tests__/fakes/console-capture';

/**
 * Tests for {@link ScoringService} (Task M5.5, §5.8.3): the binding path's refusals, model resolution, assembly as-of
 * rule, per-batch writes, column copy and live mirror, and the model path. The world's store is the provider; the
 * sidecar, model runtime, Feature Value store and challenger source are doubles.
 */

const NEWER_DAY = new Date('2026-03-05T00:00:00Z');
const OLDER_DAY = new Date('2026-03-01T00:00:00Z');

let world: ScoringServiceWorld;
let published: WorldModelRef;
let binding: MJMLModelScoringBindingEntity;
const asOf = new Date('2026-03-04T00:00:00Z');
const scope = Records('r1', 'r2');

beforeEach(async () => {
  world = new ScoringServiceWorld();
  published = world.Model();
  binding = await world.Binding(published);
});

const ctx = (): ReturnType<ScoringServiceWorld['Ctx']> => world.Ctx();
const runs = {
  Statuses: (): unknown[] => world.Runs().map((r) => r['Status']),
  Last: (): Record<string, unknown> => world.Runs()[world.Runs().length - 1],
  All: (): Record<string, unknown>[] => world.Runs(),
};
const Withdrawn = (b: MJMLModelScoringBindingEntity): Promise<MJMLModelScoringBindingEntity> => world.Changed(b, { Status: 'Withdrawn' });
const WithColumn = (b: MJMLModelScoringBindingEntity, source: string, column = 'Score'): Promise<MJMLModelScoringBindingEntity> =>
  world.Changed(b, { TargetColumn: column, TargetColumnSource: source });
/** A binding of a pipeline whose only model is a pre-change model kept serving while Unevaluated. */
async function LegacyServedBinding(o: WorldModelOptions = {}): Promise<{ readonly Binding: MJMLModelScoringBindingEntity; readonly Model: WorldModelRef }> {
  const model = world.Model({ Status: 'Unevaluated', ServingWhileUnevaluated: true, ...o });
  return { Binding: await world.Binding(model, { FeatureName: `Legacy ${model.ID}` }), Model: model };
}

describe('ScoringService.Score — refusals', () => {
  it('refuses a withdrawn binding with a refused run row and writes nothing', async () => {
    const r = await new ScoringService(ctx()).Score(await Withdrawn(binding), scope, asOf, false);
    expect(r).toMatchObject({ Status: 'refused', Reason: { kind: 'binding-withdrawn', bindingId: binding.ID } });
    expect([runs.Statuses(), world.Values.Calls()]).toEqual([['refused'], []]);
  });

  it('refuses a caller who does not hold the binding\'s view authorization before any read, with a refused run row', async () => {
    const r = await new ScoringService({ ...ctx(), ContextUser: ScoringServiceWorld.WithoutAuthorization() }).Score(binding, scope, asOf, false);
    expect(r).toMatchObject({ Status: 'refused', Reason: { kind: 'binding-not-authorized', bindingId: binding.ID } });
    expect([world.Values.Reads(), world.Values.Calls()]).toEqual([[], []]);
    expect(runs.Last()).toMatchObject({ Status: 'refused', ModelID: null, Written: 0 });
  });

  it('refuses a binding with no view authorization (fail closed)', async () => {
    const r = await new ScoringService(ctx()).Score(await world.Changed(binding, { ViewAuthorizationID: null }), scope, asOf, false);
    expect(r).toMatchObject({ Status: 'refused', Reason: { kind: 'binding-not-authorized' } });
  });

  it('serves a pipeline with no Published model through its ServingWhileUnevaluated model', async () => {
    const legacy = await LegacyServedBinding({ Unit: null });
    const r = await new ScoringService(ctx()).Score(legacy.Binding, scope, RUN_DATE, false);
    expect(r).toMatchObject({ Status: 'completed' });
    expect(world.Values.Calls()[0]).toMatchObject({ MLModelID: legacy.Model.ID });
  });

  it('checks a serving pre-change model against its stored FeatureSchema and refuses one flagged by the dominance re-run', async () => {
    expect(await new ScoringService(ctx()).Score((await LegacyServedBinding({ RenamedColumn: 'Tenure' })).Binding, scope, asOf, false))
      .toMatchObject({ Status: 'refused', Reason: { kind: 'feature-schema-mismatch', missingColumns: ['Tenure'], extraColumns: ['TenureMonths'] } });
    expect(await new ScoringService(ctx()).Score((await LegacyServedBinding({ FeatureImportance: { leaky: 0.95, other: 0.05 } })).Binding, scope, asOf, false))
      .toMatchObject({ Status: 'refused', Reason: { kind: 'model-flagged', flags: [], dominance: { topFeature: 'leaky', topShare: 0.95, threshold: 0.6 } } });
    expect(await new ScoringService(ctx()).Score((await LegacyServedBinding({ FeatureImportance: null })).Binding, scope, asOf, false))
      .toMatchObject({ Status: 'refused', Reason: { kind: 'leakage-unknown' } });
    expect(world.Values.Calls()).toEqual([]);
  });

  it('refuses a backfill of a serving pre-change model without a unit, and scores it on the run date', async () => {
    const legacy = await LegacyServedBinding({ Unit: null });
    expect(await new ScoringService(ctx()).Score(legacy.Binding, scope, new Date('2026-01-05T00:00:00Z'), false))
      .toMatchObject({ Status: 'refused', Reason: { kind: 'as-of-unsupported', modelId: legacy.Model.ID } });
    expect(world.Values.Calls()).toEqual([]);
    expect(await new ScoringService(ctx()).Score(legacy.Binding, scope, RUN_DATE, false)).toMatchObject({ Status: 'completed' });
  });

  it('refuses a binding whose pipeline has only a non-serving Unevaluated model as no-published-model', async () => {
    const unevaluated = world.Model({ Status: 'Unevaluated', ServingWhileUnevaluated: false });
    expect(await new ScoringService(ctx()).Score(await world.Binding(unevaluated, { FeatureName: 'Other' }), scope, asOf, false))
      .toMatchObject({ Status: 'refused', Reason: { kind: 'no-published-model', pipelineId: unevaluated.PipelineID } });
  });

  it('refuses a binding whose pipeline has no Published model, with a null ModelID on the run row', async () => {
    const draft = world.Model({ Status: 'Validated' });
    const r = await new ScoringService(ctx()).Score(await world.Binding(draft, { FeatureName: 'Draft' }), scope, asOf, false);
    expect(r).toMatchObject({ Status: 'refused', Reason: { kind: 'no-published-model' } });
    expect(runs.Last()).toMatchObject({ Status: 'refused', ModelID: null, Written: 0 });
  });

  it('refuses a scope over another entity than the binding\'s', async () => {
    const r = await new ScoringService(ctx()).Score(binding, { kind: 'record-ids', entity: 'MJ: Authorizations', ids: ['x'] }, asOf, false);
    expect(r).toMatchObject({ Status: 'refused', Reason: { kind: 'scope-entity-mismatch' } });
  });

  it('refuses an artifact whose bytes changed and records the model\'s ArtifactStatus', async () => {
    world.Artifacts.Set(`file-${published.ID}`, new TextEncoder().encode('tampered'));
    expect(await new ScoringService(ctx()).Score(binding, scope, asOf, false)).toMatchObject({ Status: 'refused', Reason: { kind: 'artifact-hash-mismatch' } });
    expect(world.ModelRow(published)).toMatchObject({ ArtifactStatus: 'hash-mismatch', ArtifactCheckedAt: expect.any(Date) });
  });

  it('a model-path artifact refusal records ArtifactStatus too', async () => {
    world.Artifacts.Set(`file-${published.ID}`, new TextEncoder().encode('tampered'));
    const p = await new ScoringService({ ...ctx(), Path: 'predict' }).Predict(world.RequestFor(published.ID, Records('r1')));
    expect(p.Result).toMatchObject({ Status: 'refused', Reason: { kind: 'artifact-hash-mismatch' } });
    expect(world.ModelRow(published)).toMatchObject({ ArtifactStatus: 'hash-mismatch' });
  });

  it('a model that was never trained (no artifact file) fails as needing training, never as an artifact-missing with no file', async () => {
    const untrained = world.Model({ NoArtifactFile: true });
    const errors = ConsoleCapture.Errors();
    const r = await new ScoringService(ctx()).Score(await world.Binding(untrained, { FeatureName: 'Untrained' }), scope, asOf, false);
    expect(r).toMatchObject({ Status: 'failed', FirstErrors: [{ message: expect.stringContaining('needs training') }] });
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringContaining('needs training')]);
  });
});

describe('ScoringService.Score — writes', () => {
  it('assembles a grain-x-periods unit with the unit rule and every other unit with the as-of date', async () => {
    const periods = world.Model({ Unit: 'grain-x-periods' });
    await new ScoringService(ctx()).Score(await world.Binding(periods, { FeatureName: 'Periods' }), scope, asOf, false);
    await new ScoringService(ctx()).Score(binding, scope, asOf, false);
    expect(world.Runtime.AsOfArguments()).toEqual(['unit-rule', new Date('2026-03-04T00:00:00Z')]);
  });

  it('normalises asOf to 00:00 UTC and writes every row with the run\'s lineage', async () => {
    await new ScoringService(ctx()).Score(binding, scope, new Date('2026-03-04T17:30:00-05:00'), false);
    expect(world.Values.Calls()[0]).toMatchObject({ EffectiveAsOf: new Date('2026-03-04T00:00:00Z'), MLModelID: published.ID, MLScoringRunID: runs.Last()['ID'], Role: 'Champion' });
    expect(runs.Last()).toMatchObject({ Status: 'completed', Written: 2, Total: 2, ModelID: published.ID });
  });

  it('a failing third batch leaves batches 1 and 2, ends failed with counts, and a re-run replaces exactly those rows', async () => {
    world.Sidecar.FailBatch(3);
    expect(await new ScoringService(ctx()).Score(binding, ThreeBatches(), asOf, false)).toMatchObject({ Status: 'failed', Total: 3 * BATCH, Failed: BATCH });
    expect(runs.Last()).toMatchObject({ Written: 2 * BATCH, Failed: BATCH, Skipped: 0, Status: 'failed' });
    expect(world.Values.Store().length).toBe(2 * BATCH);
    world.Sidecar.FailBatch(null);
    await new ScoringService(ctx()).Score(binding, ThreeBatches(), asOf, false);
    expect(world.Values.Store().length).toBe(3 * BATCH);
  });

  it('a new as-of date adds rows beside the earlier date\'s', async () => {
    await new ScoringService(ctx()).Score(binding, scope, OLDER_DAY, false);
    await new ScoringService(ctx()).Score(binding, scope, asOf, false);
    expect(world.Values.Store().length).toBe(4);
  });

  it('copies into the column only where this as-of date is the binding\'s newest Champion row', async () => {
    world.Values.Seed(binding, 'r1', NEWER_DAY, 0.9);
    world.Target.SetByPerson('r1', 0.9);
    await new ScoringService(ctx()).Score(await WithColumn(binding, '$.Probabilities.renewed'), Records('r1', 'r2'), OLDER_DAY, false);
    expect(world.Target.Values()).toEqual({ r1: 0.9, r2: ProbabilityOf('r2', 'renewed') });
  });

  it('keeps a person\'s value in the column unless OverwriteHumanValues', async () => {
    world.Target.SetByPerson('r1', 0.11);
    const bound = await WithColumn(binding, '$.AdverseProbability');
    await new ScoringService(ctx()).Score(bound, Records('r1'), asOf, false);
    expect(world.Target.Values().r1).toBe(0.11);
    await new ScoringService({ ...ctx(), OverwriteHumanValues: true }).Score(bound, Records('r1'), asOf, false);
    expect(world.Target.Values().r1).toBe(AdverseOf('r1'));
  });

  it('a copy rounds to a decimal(3,2) column\'s scale, and withdrawal recognises it as its own copy', async () => {
    const bound = await WithColumn(binding, '$.AdverseProbability', 'MinWeight');
    await new ScoringService(ctx()).Score(bound, Records('r1'), asOf, false);
    const stored = Number(world.Target.Values('MinWeight').r1);
    expect([AdverseOf('r1'), stored]).toEqual([0.8698, 0.87]);
    expect(await ScoringBindings.Withdraw(bound.ID, ctx())).toEqual({ Cleared: 1, KeptHuman: 0 });
    expect(world.Target.Values('MinWeight').r1).toBeNull();
  });

  it('dry run records the run with DryRun = 1, writes nothing and previews the column change', async () => {
    const service = new ScoringService(ctx());
    const r = await service.Score(await WithColumn(binding, '$.Value'), Records('r1'), asOf, true);
    expect([runs.Last()['DryRun'], world.Values.Calls().length, world.Target.Writes]).toEqual([true, 0, 0]);
    expect(r).toMatchObject({ Status: 'completed', DryRun: true, Written: 0 });
    expect(service.DryRunPreview()).toEqual([{ RecordID: 'r1', Column: 'Score', From: null, To: ValueOf('r1') }]);
  });

  it('the live mirror writes the challenger\'s rows under a second run row in the same transaction', async () => {
    const challenger = world.Model({ Status: 'Validated' }, published.PipelineID);
    world.Challengers.NameChallenger(binding, challenger);
    await new ScoringService(ctx()).Score(binding, Records('r1'), asOf, false);
    expect(runs.All().map((r) => [r['ModelID'], r['MLModelScoringBindingID']])).toEqual([[published.ID, binding.ID], [challenger.ID, binding.ID]]);
    expect(world.Values.Calls().map((c) => c.Role)).toEqual(['Champion', 'Challenger']);
    expect(world.TransactionCount()).toBe(1);
    expect(runs.All().map((r) => r['Status'])).toEqual(['completed', 'completed']);
  });

  it('the live mirror scores only the sampled records of each batch: a batch with none writes no Challenger rows, and the challenger run counts what it wrote', async () => {
    const challenger = world.Model({ Status: 'Validated' }, published.PipelineID);
    const sampledIds = new Set(['m2', `m${BATCH + 1}`]);   // one record of batch 1, one of batch 2, none of batch 3
    world.Challengers.NameChallenger(binding, challenger, (id) => sampledIds.has(id));
    expect(await new ScoringService(ctx()).Score(binding, ThreeBatches(), asOf, false)).toMatchObject({ Status: 'completed', Written: 3 * BATCH });
    expect(world.Values.Calls().map((c) => [c.Role, c.Rows.map((r) => r.RecordID)])).toEqual([
      ['Champion', ['m1', 'm2', 'm3']], ['Challenger', ['m2']], ['Champion', ['m4', 'm5', 'm6']], ['Challenger', ['m4']], ['Champion', ['m7', 'm8', 'm9']],
    ]);
    expect(runs.All().map((r) => [r['ModelID'], r['Status'], r['Written']])).toEqual([[published.ID, 'completed', 3 * BATCH], [challenger.ID, 'completed', 2]]);
  });

  it('a challenger whose sample draws no record of the run opens no run row and writes no Challenger rows', async () => {
    const challenger = world.Model({ Status: 'Validated' }, published.PipelineID);
    world.Challengers.NameChallenger(binding, challenger, () => false);
    await new ScoringService(ctx()).Score(binding, Records('r1', 'r2'), asOf, false);
    expect([runs.All().map((r) => r['ModelID']), world.Values.Calls().map((c) => c.Role)]).toEqual([[published.ID], ['Champion']]);
  });

  it('a challenger whose feature schema does not match the assembled columns gets a refused run and writes no Challenger rows', async () => {
    const mismatched = world.Model({ Status: 'Validated', FeatureSchemaHash: 'deadbeef'.repeat(8) }, published.PipelineID);
    world.Challengers.NameChallenger(binding, mismatched);
    expect(await new ScoringService(ctx()).Score(binding, Records('r1'), asOf, false)).toMatchObject({ Status: 'completed', Written: 1 });
    expect(runs.All().map((r) => [r['ModelID'], r['Status']])).toEqual([[published.ID, 'completed'], [mismatched.ID, 'refused']]);
    expect(JSON.parse(String(runs.All()[1]['Refusal']))).toMatchObject({ kind: 'feature-schema-mismatch', expectedHash: 'deadbeef'.repeat(8) });
    expect(world.Values.Calls().map((c) => c.Role)).toEqual(['Champion']);
  });

  it('a challenger whose artifact changed is refused without recording its ArtifactStatus (the shadow load writes none)', async () => {
    const challenger = world.Model({ Status: 'Validated' }, published.PipelineID);
    world.Artifacts.Set(`file-${challenger.ID}`, new TextEncoder().encode('tampered'));
    world.Challengers.NameChallenger(binding, challenger);
    expect(await new ScoringService(ctx()).Score(binding, Records('r1'), asOf, false)).toMatchObject({ Status: 'completed' });
    expect(world.ModelRow(challenger)).toMatchObject({ ArtifactStatus: 'verified', ArtifactCheckedAt: null });
  });

  it('the column copy\'s guard reads a constant number of Feature Value queries per batch, whatever its size', async () => {
    const bound = await WithColumn(binding, '$.AdverseProbability');
    const counts: number[] = [];
    for (const size of [3, 6]) {
      const ids = Array.from({ length: size }, (_, i) => `n${size}-${i}`);
      for (const id of ids) {
        world.Values.Seed(bound, id, OLDER_DAY, 0.5);   // the binding's earlier copy …
        world.Target.SetByPerson(id, 0.5);               // … is what the column holds, so every record changes
      }
      const from = world.Store.Reads.length;
      await new ScoringService(world.Ctx({ Seams: { ...ctx().Seams, BatchSize: size } })).Score(bound, Records(...ids), asOf, false);
      counts.push(world.FeatureValueReadsSince(from).length);
      expect(ids.map((id) => world.Target.Values()[id])).toEqual(ids.map((id) => AdverseOf(id)));
    }
    expect(counts).toEqual([2, 2]);
  });

  it('the batch snapshot sees a Human row: a person\'s value equal to the newest copy is kept on the next run', async () => {
    const bound = await WithColumn(binding, '$.AdverseProbability');
    world.Values.Seed(bound, 'r1', OLDER_DAY, 0.5);   // the binding's earlier copy …
    world.Target.SetByPerson('r1', 0.5);               // … equals the column's value,
    world.Values.SeedHuman(bound, 'r1', null);         // but a person has claimed the value since
    await new ScoringService(ctx()).Score(bound, Records('r1'), asOf, false);
    expect([world.Target.Values().r1, world.Target.Writes]).toEqual([0.5, 0]);
  });

  it('a challenger that is not scorable gets a refused run row and the champion still scores', async () => {
    const archived = world.Model({ Status: 'Archived' }, published.PipelineID);
    world.Challengers.NameChallenger(binding, archived);
    expect(await new ScoringService(ctx()).Score(binding, Records('r1'), asOf, false)).toMatchObject({ Status: 'completed', Written: 1 });
    expect(runs.All().map((r) => [r['ModelID'], r['Status']])).toEqual([[published.ID, 'completed'], [archived.ID, 'refused']]);
  });
});

describe('ScoringService.Predict', () => {
  it('Predict writes no Feature Value and no column', async () => {
    const p = await new ScoringService({ ...ctx(), Path: 'predict' }).Predict(world.RequestFor(published.ID, Records('r1')));
    expect([p.Rows.length, world.Values.Calls().length, world.Target.Writes]).toEqual([1, 0, 0]);
    expect(p.Result).toMatchObject({ Status: 'completed', Written: 0 });
    expect(runs.Last()).toMatchObject({ Path: 'predict', MLModelScoringBindingID: null, Status: 'completed' });
  });

  it('Predict refuses a model that is not Published', async () => {
    const validated = world.Model({ Status: 'Validated' });
    const p = await new ScoringService({ ...ctx(), Path: 'predict' }).Predict(world.RequestFor(validated.ID, Records('r1')));
    expect(p.Result).toMatchObject({ Status: 'refused', Reason: { kind: 'model-not-published', status: 'Validated' } });
  });

  it('Predict on an unknown model is refused with the typed needs-training error and writes no run', async () => {
    await expect(new ScoringService({ ...ctx(), Path: 'predict' }).Predict(world.RequestFor('B0000000-0000-4000-8000-0000000005FF', Records('r1')))).rejects.toBeInstanceOf(ModelNeedsTrainingError);
    expect(world.Runs()).toEqual([]);
  });

  it('a sidecar failure ends the prediction failed with the batch\'s records as errors', async () => {
    world.Sidecar.FailBatch(1);
    const errors = ConsoleCapture.Errors();
    const p = await new ScoringService({ ...ctx(), Path: 'predict' }).Predict(world.RequestFor(published.ID, Records('r1')));
    expect(p.Result).toMatchObject({ Status: 'failed', Failed: 1, FirstErrors: [{ recordId: 'r1', message: 'sidecar: batch 1 failed' }] });
    expect(ConsoleCapture.Lines(errors)).toEqual([]);
  });
});
