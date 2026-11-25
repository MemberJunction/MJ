import { describe, it, expect, beforeEach } from 'vitest';
import type { MJMLModelScoringBindingEntity } from '@memberjunction/core-entities';

import { BindingHumanValueGuard } from '../binding-human-value-guard';
import { MEMBERSHIPS_ID, ScoringServiceWorld } from '../../__tests__/fakes/scoring-service-world';

/**
 * Tests for {@link BindingHumanValueGuard}: the column copy's guard reads the binding's `Champion` `Model` rows by
 * binding (they carry no Record Process) and the `Human` rows by record and feature.
 */

const DAY1 = new Date('2026-02-01T00:00:00Z');
const PROCESS_ID = 'C0000000-0000-4000-8000-0000000005C1';

let world: ScoringServiceWorld;
let binding: MJMLModelScoringBindingEntity;
let guard: BindingHumanValueGuard;

beforeEach(async () => {
  world = new ScoringServiceWorld();
  binding = await world.Binding(world.Model(), { TargetColumn: 'RenewalProbability', TargetColumnSource: '$.AdverseProbability' });
  guard = new BindingHumanValueGuard(binding, { EntityID: MEMBERSHIPS_ID, RecordID: 'r1' }, world.Ctx());
});

describe('BindingHumanValueGuard.IsHumanOwned', () => {
  it('a value the binding\'s newest earlier Champion row copied is not human-owned (no Record Process)', async () => {
    world.Values.Seed(binding, 'r1', DAY1, 0.7);   // Model row, RecordProcessID null
    expect(await guard.IsHumanOwned(world.Question('RenewalProbability', 0.7))).toBe(false);
  });

  it('a Human row of the binding\'s feature makes the field human-owned, with and without a Record Process', async () => {
    for (const recordProcessId of [null, PROCESS_ID]) {
      world = new ScoringServiceWorld();
      binding = await world.Binding(world.Model(), { TargetColumn: 'RenewalProbability', TargetColumnSource: '$.AdverseProbability' });
      guard = new BindingHumanValueGuard(binding, { EntityID: MEMBERSHIPS_ID, RecordID: 'r1' }, world.Ctx());
      world.Values.Seed(binding, 'r1', DAY1, 0.7);
      world.Values.SeedHuman(binding, 'r1', recordProcessId);
      expect(await guard.IsHumanOwned(world.Question('RenewalProbability', 0.7))).toBe(true);
    }
  });

  it('a value other than the newest copy, or a column the binding never copied into, is human-owned', async () => {
    expect(await guard.IsHumanOwned(world.Question('RenewalProbability', 0.7))).toBe(true);
    world.Values.Seed(binding, 'r1', DAY1, 0.7);
    world.Values.Seed(binding, 'r1', new Date('2026-02-02T00:00:00Z'), 0.4);
    expect(await guard.IsHumanOwned(world.Question('RenewalProbability', 0.7))).toBe(true);
    expect(await guard.IsHumanOwned(world.Question('RenewalProbability', 0.4))).toBe(false);
  });

  it('answers false for a field the binding does not copy into', async () => {
    expect(await guard.IsHumanOwned(world.Question('Score', 0.7))).toBe(false);
  });
});

describe('BindingHumanValueGuard.RecordPreserved / RetireHumanValue', () => {
  it('records the preserved value as a Human row scoped by the binding, and retires it', async () => {
    await guard.RecordPreserved('RenewalProbability', 0.33, world.Provider);
    const human = (world.Store.Tables['MJ: Feature Values'] || []).filter((r) => r['Source'] === 'Human');
    expect(human).toEqual([expect.objectContaining({ RecordID: 'r1', FeatureName: 'Renewal', RecordProcessID: null, MLModelScoringBindingID: binding.ID, ValueNumeric: 0.33 })]);
    expect(await guard.IsHumanOwned(world.Question('RenewalProbability', 0.33))).toBe(true);
    expect(await guard.RetireHumanValue('RenewalProbability', world.Provider)).toBe(true);
    expect(await guard.RetireHumanValue('RenewalProbability', world.Provider)).toBe(false);
  });

  it('a guard of a Record Process run records the Human row under the process, and retires it from that scope', async () => {
    const processBinding = await world.Binding(world.Model(), { FeatureName: 'Process', TargetColumn: 'RenewalProbability', TargetColumnSource: '$.AdverseProbability', RecordProcessID: PROCESS_ID });
    const run = new BindingHumanValueGuard(processBinding, { EntityID: MEMBERSHIPS_ID, RecordID: 'r2' }, world.Ctx({ ProcessRunID: 'C0000000-0000-4000-8000-0000000005C2' }));
    await run.RecordPreserved('RenewalProbability', 0.44, world.Provider);
    const human = (): Record<string, unknown>[] => (world.Store.Tables['MJ: Feature Values'] || []).filter((r) => r['Source'] === 'Human' && r['RecordID'] === 'r2');
    expect(human()).toEqual([expect.objectContaining({ RecordProcessID: PROCESS_ID, MLModelScoringBindingID: null })]);
    expect(await run.RetireHumanValue('RenewalProbability', world.Provider)).toBe(true);
    expect(human()).toEqual([]);
  });
});
