import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEntity } from '@memberjunction/core';

// Neutralize class-factory registration, as the package's other entity tests do.
vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return { ...actual, RegisterClass: () => (target: object) => target };
});

import { MJPredictionUnitEntityServer, VersionedRowGuard } from '../custom/MJPredictionUnitEntityServer.server';
import { MJEvaluationProtocolEntityServer, type ProtocolVersionRead } from '../custom/MJEvaluationProtocolEntityServer.server';
import { EvaluationProtocol, EvaluationProtocolRules, type Actor, type EvaluationProtocolColumns, type HoldoutSplit, type PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import { MJTrainingSnapshotEntityServer } from '../custom/MJTrainingSnapshotEntityServer.server';
import { MJMLTrainingPipelineEntityServer } from '../custom/MJMLTrainingPipelineEntityServer.server';

const human: Actor = { kind: 'human', userId: 'U-1' };
const seeded: HoldoutSplit = { kind: 'seeded-random', fraction: 0.25 };
/** A count unit with one fixed decision date (its protocol holds out a seeded-random share of rows). */
const countUnit: PredictionUnitSpec = {
  id: 'U-1', lineageRootId: 'U-1', version: 1, name: 'visits',
  rows: { kind: 'grain', grainEntity: 'Members', decisionDate: { kind: 'fixed', date: '2020-01-01' }, filter: [] },
  label: { rule: { kind: 'column', column: 'Target' }, windowDays: 31, gapDays: 0, outcome: { kind: 'count' }, labelVersion: 1 },
  censoring: { rule: 'exclude-unresolved', cutoff: { kind: 'fixed', at: '2020-12-31' } },
  history: { onUncoveredRow: 'refuse', externalSourceRows: 'ineligible' }, groupKey: null, temporal: null,
  decision: { action: 'call', actorRole: 'team', capacityPerPeriod: null, period: 'year' },
  incumbent: { kind: 'none' }, authoredBy: human,
};

describe('GetVersionedRowUpdateProblem', () => {
  it('allows a new row and a saved row with no change', () => {
    expect(VersionedRowGuard.GetVersionedRowUpdateProblem('MJ: Prediction Units', false, ['Name'])).toBeNull();
    expect(VersionedRowGuard.GetVersionedRowUpdateProblem('MJ: Prediction Units', true, [])).toBeNull();
  });
  it('refuses any change to a saved version, naming the fields', () => {
    expect(VersionedRowGuard.GetVersionedRowUpdateProblem('MJ: Prediction Units', true, ['LabelRule', 'LabelWindowDays'])).toBe(
      'MJ: Prediction Units rows are immutable versions; LabelRule, LabelWindowDays cannot be changed on a saved version. Save a new version instead (Version + 1, same LineageRootID).',
    );
  });
});

describe('GetTrainingSnapshotRowProblems', () => {
  it('refuses an incomplete read and a malformed hash', () => {
    const problems = MJTrainingSnapshotEntityServer.GetTrainingSnapshotRowProblems({ ReadComplete: false, ContentHash: 'abc', MatrixSha256: 'a'.repeat(64), RowManifestSha256: 'b'.repeat(64), ProvenanceSha256: 'c'.repeat(64), FeatureSchemaHash: 'd'.repeat(64) });
    expect(problems).toContain('ReadComplete must be true: a snapshot exists only for a complete read');
    expect(problems).toContain('ContentHash must be 64 lower-case hex characters');
  });
});

describe('GetPipelineUnitProblems and GetProtocolUnitProblems', () => {
  const unit = { TaskType: JSON.stringify({ kind: 'count' }), RowEntityID: 'E-ROW', DescribedLabel: 'Target within 31 days' };
  it("refuses a protocol whose primary score family differs from the unit's task, in the protocol rules' own words", () => {
    const continuous = EvaluationProtocolRules.EvaluationProtocolColumnsFromDraft(
      EvaluationProtocolRules.DefaultEvaluationProtocolDraft({ Unit: { ...countUnit, label: { ...countUnit.label, outcome: { kind: 'continuous' } } }, Holdout: seeded, Candidates: 1, Seed: 0, Name: 'continuous' }),
      { ID: 'P-C', LineageRootID: 'P-C', Version: 1, AuthoredBy: human },
    );
    expect(MJMLTrainingPipelineEntityServer.GetProtocolUnitProblems(continuous, countUnit)).toEqual([
      "The primary score is a continuous score but the Prediction Unit's task is count; candidates may only be ranked by a count score.",
    ]);
    const fits = EvaluationProtocolRules.EvaluationProtocolColumnsFromDraft(
      EvaluationProtocolRules.DefaultEvaluationProtocolDraft({ Unit: countUnit, Holdout: seeded, Candidates: 1, Seed: 0, Name: 'count' }),
      { ID: 'P-N', LineageRootID: 'P-N', Version: 1, AuthoredBy: human },
    );
    expect(MJMLTrainingPipelineEntityServer.GetProtocolUnitProblems(fits, countUnit)).toEqual([]);
    expect(MJMLTrainingPipelineEntityServer.GetProtocolUnitProblems({ ...fits, Holdout: '{"kind":"sideways"}' }, countUnit)[0]).toMatch(/^Evaluation Protocol P-N does not parse: /);
  });
  it('refuses legacy columns that disagree with the unit', () => {
    const problems = MJMLTrainingPipelineEntityServer.GetPipelineUnitProblems({ TargetEntityID: 'OTHER', ProblemType: 'classification', TargetVariable: 'x' }, unit);
    expect(problems).toEqual([
      'TargetEntityID must be the unit\'s row entity (E-ROW) when PredictionUnitID is set',
      'ProblemType must be regression for a count unit',
      'TargetVariable must read "Target within 31 days" (the unit\'s outcome rule)',
    ]);
  });
});

/** An Evaluation Protocol server row whose previous version is served from memory (no database). */
class InMemoryLineageProtocol extends MJEvaluationProtocolEntityServer {
  public Previous: EvaluationProtocolColumns | null = null;
  protected override async LoadVersion(): Promise<ProtocolVersionRead> {
    return { Row: this.Previous, Error: null };
  }
}

/** A new protocol row with the given columns over a metadata provider double, its previous version in memory. */
function newProtocolRow(columns: EvaluationProtocolColumns, previous: EvaluationProtocolColumns | null): InMemoryLineageProtocol {
  const row = Object.create(InMemoryLineageProtocol.prototype) as InMemoryLineageProtocol;
  const provider = { EntityByName: () => undefined, Entities: [] };
  for (const [name, value] of Object.entries({ ...columns, IsSaved: false, ProviderToUse: provider, ContextCurrentUser: undefined, Previous: previous })) {
    Object.defineProperty(row, name, { value, writable: true, configurable: true });
  }
  return row;
}

describe('MJEvaluationProtocolEntityServer.ValidateAsync (who may change the guard fields of a protocol lineage)', () => {
  const draft = EvaluationProtocolRules.DefaultEvaluationProtocolDraft({ Unit: countUnit, Holdout: seeded, Candidates: 1, Seed: 0, Name: 'p' });
  const v1 = EvaluationProtocolRules.EvaluationProtocolColumnsFromDraft(draft, { ID: 'P-1', LineageRootID: 'P-1', Version: 1, AuthoredBy: human });
  const v2Of = (previous: EvaluationProtocolColumns, changes: Partial<typeof draft>, author: Actor): EvaluationProtocolColumns =>
    EvaluationProtocolRules.EvaluationProtocolColumnsFromDraft({ ...draft, guardFieldsEditableBy: previous.GuardFieldsEditableBy === 'human-only' ? 'human-only' : 'non-agent', ...changes }, { ID: 'P-2', LineageRootID: previous.LineageRootID, Version: 2, AuthoredBy: author });
  const margin = { promotion: { ...draft.promotion, margin: EvaluationProtocol.ToNonNegative(0.01) } };

  it('refuses an agent tool call that changes a guard field, naming the field', async () => {
    const result = await newProtocolRow(v2Of(v1, margin, { kind: 'agent', agentRunId: 'AR-1' }), v1).ValidateAsync();
    expect(result.Success).toBe(false);
    expect(result.Errors.map((e) => [e.Source, e.Message])).toEqual([
      ['AuthoredBy', 'An agent tool call cannot change the guard fields promotion; they are set in protocol configuration (UI, a non-agent API caller, a scheduled job or shipped metadata).'],
    ]);
  });
  it('saves a scheduled job changing a guard field under non-agent', async () => {
    const result = await newProtocolRow(v2Of(v1, margin, { kind: 'scheduled-job', scheduledJobRunId: 'SJ-1' }), v1).ValidateAsync();
    expect([result.Success, result.Errors]).toEqual([true, []]);
  });
  it('refuses a scheduled job switching a human-only lineage back to non-agent', async () => {
    const humanOnly = { ...v1, GuardFieldsEditableBy: 'human-only' as const };
    const result = await newProtocolRow(v2Of(humanOnly, { guardFieldsEditableBy: 'non-agent' }, { kind: 'scheduled-job', scheduledJobRunId: 'SJ-2' }), humanOnly).ValidateAsync();
    expect(result.Success).toBe(false);
    expect(result.Errors.map((e) => e.Message)).toEqual([
      'This protocol is set to human-only guard fields: only a version authored by a user may change guardFieldsEditableBy; this version was authored by: scheduled-job.',
    ]);
  });
  it('refuses a version without a dummy baseline, and a version whose previous version is missing', async () => {
    const noDummy = EvaluationProtocolRules.EvaluationProtocolColumnsFromDraft({ ...draft, baselines: [] , promotion: { ...draft.promotion, comparators: [] } }, { ID: 'P-9', LineageRootID: 'P-9', Version: 1, AuthoredBy: human });
    expect((await newProtocolRow(noDummy, null).ValidateAsync()).Errors.map((e) => [e.Source, e.Message])).toEqual([
      ['Baselines', 'A dummy baseline (base rate or mean) is required: it is the "no signal" yardstick of the gate.'],
    ]);
    const orphan = await newProtocolRow(v2Of(v1, {}, human), null).ValidateAsync();
    expect(orphan.Errors.map((e) => e.Message)).toEqual(['versions must be consecutive: version 1 of lineage P-1 does not exist']);
  });
});

/** A server entity object with only the members the Save override reads, so no database or metadata is needed. */
function newRowOf<T extends object>(ctor: { prototype: T }, members: { IsSaved: boolean; Version: number; ID: string; LineageRootID: string }): T {
  const row = Object.create(ctor.prototype) as T;
  for (const [name, value] of Object.entries(members)) {
    Object.defineProperty(row, name, { value, writable: true, configurable: true });
  }
  return row;
}

/** A versioned server row class: the members the Save override reads. */
type VersionedRowClass = { prototype: { IsSaved: boolean; Version: number; ID: string; LineageRootID: string; Save(): Promise<boolean> } };
const versionedRowClasses: readonly (readonly [string, VersionedRowClass])[] = [
  ['MJ: Prediction Units', MJPredictionUnitEntityServer],
  ['MJ: Evaluation Protocols', MJEvaluationProtocolEntityServer],
];

describe.each(versionedRowClasses)('%s Save adopts the lineage root', (_name, ctor) => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('sets LineageRootID to ID on a new version-1 row before the base save runs', async () => {
    let rootAtBaseSave = '';
    vi.spyOn(BaseEntity.prototype, 'Save').mockImplementation(async function (this: { LineageRootID: string }) {
      rootAtBaseSave = this.LineageRootID;
      return true;
    });
    const row = newRowOf(ctor, { IsSaved: false, Version: 1, ID: 'ID-1', LineageRootID: 'SOMETHING-ELSE' });
    expect(await row.Save()).toBe(true);
    expect(rootAtBaseSave).toBe('ID-1');
    const blank = newRowOf(ctor, { IsSaved: false, Version: 1, ID: 'ID-2', LineageRootID: '' });
    await blank.Save();
    expect(blank.LineageRootID).toBe('ID-2');
  });
  it('leaves a later version and a saved row alone', async () => {
    vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
    const later = newRowOf(ctor, { IsSaved: false, Version: 2, ID: 'ID-3', LineageRootID: 'ROOT' });
    await later.Save();
    expect(later.LineageRootID).toBe('ROOT');
    const saved = newRowOf(ctor, { IsSaved: true, Version: 1, ID: 'ID-4', LineageRootID: 'ROOT' });
    await saved.Save();
    expect(saved.LineageRootID).toBe('ROOT');
  });
});

describe('ExpectedLabelVersion', () => {
  it('is the previous LabelVersion, plus one when the outcome definition changed', () => {
    expect(MJPredictionUnitEntityServer.ExpectedLabelVersion(3, false)).toBe(3);
    expect(MJPredictionUnitEntityServer.ExpectedLabelVersion(3, true)).toBe(4);
  });
});
