import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseEntity, BaseEntityResult, EntitySaveOptions, RunView, ValidationResult, type RunViewParams, type UserInfo } from '@memberjunction/core';

// Neutralize class-factory registration, as the package's other entity tests do.
vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return { ...actual, RegisterClass: () => (target: object) => target };
});

import { MJMLPredictionUnitEntityServer, VersionedRowGuard, type RowRead } from '../custom/MJMLPredictionUnitEntityServer.server';
import { MJMLEvaluationProtocolEntityServer } from '../custom/MJMLEvaluationProtocolEntityServer.server';
import { EvaluationProtocol, EvaluationProtocolRules, ProtocolRows, type Actor, type EvaluationProtocolColumns, type HoldoutSplit, type PredictionUnitColumns, type PredictionUnitSpec } from '@memberjunction/predictive-studio-core';
import { MJMLTrainingSnapshotEntityServer } from '../custom/MJMLTrainingSnapshotEntityServer.server';
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
    expect(VersionedRowGuard.GetVersionedRowUpdateProblem('MJ: ML Prediction Units', false, ['Name'], true)).toBeNull();
    expect(VersionedRowGuard.GetVersionedRowUpdateProblem('MJ: ML Prediction Units', true, [], true)).toBeNull();
  });
  it('refuses any change to a saved version, naming the fields', () => {
    expect(VersionedRowGuard.GetVersionedRowUpdateProblem('MJ: ML Prediction Units', true, ['LabelRule', 'LabelWindowDays'], true)).toBe(
      'MJ: ML Prediction Units rows are immutable versions; LabelRule, LabelWindowDays cannot be changed on a saved version. Save a new version instead (Version + 1, same LineageRootID).',
    );
  });
  it('tells a row with no lineage (a Training Snapshot) to write a new row, not a new version', () => {
    expect(VersionedRowGuard.GetVersionedRowUpdateProblem('MJ: ML Training Snapshots', true, ['ContentHash'], false)).toBe(
      'MJ: ML Training Snapshots rows are immutable once saved; ContentHash cannot be changed on a saved row. Write a new row instead.',
    );
  });
});

describe('VersionedRowGuard.PreviousVersion', () => {
  type Row = { readonly ID: string; readonly Value: string };
  const args = (read: RowRead<Row>, version = 2) => ({
    Label: 'Thing', LineageRootID: 'L-1', Version: version,
    Load: async () => read,
    Parse: (row: Row) => (row.Value === 'ok' ? { Ok: true as const, Value: row.Value.length } : { Ok: false as const, Errors: ['bad value'] }),
  });
  const fresh = (): ValidationResult => {
    const r = new ValidationResult();
    r.Success = true;
    return r;
  };
  it('is null for version 1 and the row with its parsed form otherwise', async () => {
    expect(await VersionedRowGuard.PreviousVersion(fresh(), args({ Row: null, Error: null }, 1))).toBeNull();
    expect(await VersionedRowGuard.PreviousVersion(fresh(), args({ Row: { ID: 'R-1', Value: 'ok' }, Error: null }))).toEqual({ Row: { ID: 'R-1', Value: 'ok' }, Spec: 2 });
  });
  it('records a failed read as a failed read, never as a missing version', async () => {
    const result = fresh();
    expect(await VersionedRowGuard.PreviousVersion(result, args({ Row: null, Error: 'timeout' }))).toBeUndefined();
    expect(result.Success).toBe(false);
    expect(result.Errors.map((e) => e.Message)).toEqual(['Reading version 1 of lineage L-1 failed: timeout']);
  });
  it('records a missing and an unparseable previous version', async () => {
    const missing = fresh();
    expect(await VersionedRowGuard.PreviousVersion(missing, args({ Row: null, Error: null }))).toBeUndefined();
    expect(missing.Errors.map((e) => e.Message)).toEqual(['versions must be consecutive: version 1 of lineage L-1 does not exist']);
    const unparseable = fresh();
    expect(await VersionedRowGuard.PreviousVersion(unparseable, args({ Row: { ID: 'R-1', Value: 'no' }, Error: null }))).toBeUndefined();
    expect(unparseable.Errors.map((e) => e.Message)).toEqual(['Thing version 1 (R-1) does not parse: bad value']);
  });
});

describe('GetTrainingSnapshotRowProblems', () => {
  it('refuses an incomplete read and a malformed hash', () => {
    const problems = MJMLTrainingSnapshotEntityServer.GetTrainingSnapshotRowProblems({ ReadComplete: false, ContentHash: 'abc', MatrixSha256: 'a'.repeat(64), RowManifestSha256: 'b'.repeat(64), ProvenanceSha256: 'c'.repeat(64), FeatureSchemaHash: 'd'.repeat(64) });
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
class InMemoryLineageProtocol extends MJMLEvaluationProtocolEntityServer {
  public Previous: EvaluationProtocolColumns | null = null;
  protected override async LoadVersion(): Promise<RowRead<EvaluationProtocolColumns>> {
    return { Row: this.Previous, Error: null };
  }
}

/**
 * Where a double's saving user comes from: the entity's context user, the provider's current user (no context user
 * set), or nowhere (`BaseEntity.ActiveUser` resolves no user).
 */
type SavingUserSource = 'context' | 'provider' | 'none';

/**
 * Defines `members` on `row`, plus the saving user `savingUserId` from `source`. With no user, `ActiveUser` itself is
 * stubbed: its last fallback is the global `Metadata.Provider`, which these tests never configure.
 */
function defineMembers(row: object, members: Record<string, object | string | number | boolean | null | undefined>, savingUserId: string | null, source: SavingUserSource = 'context'): void {
  const user = savingUserId === null || source === 'none' ? undefined : { ID: savingUserId };
  const provider = { EntityByName: () => undefined, EntityByID: () => undefined, Entities: [], CurrentUser: source === 'provider' ? user : undefined };
  const all = { ProviderToUse: provider, ...members, ContextCurrentUser: source === 'context' ? user : undefined, ...(user === undefined ? { ActiveUser: undefined } : {}) };
  for (const [name, value] of Object.entries(all)) {
    Object.defineProperty(row, name, { value, writable: true, configurable: true });
  }
}

/**
 * A new protocol row with the given columns over a metadata provider double, its previous version in memory, saved by
 * `savingUserId` (default the fixtures' human author, U-1) set as the context user, or as the provider's user.
 */
function newProtocolRow(columns: EvaluationProtocolColumns, previous: EvaluationProtocolColumns | null, savingUserId: string | null = 'U-1', source: SavingUserSource = 'context'): InMemoryLineageProtocol {
  const row = Object.create(InMemoryLineageProtocol.prototype) as InMemoryLineageProtocol;
  defineMembers(row, { ...columns, IsSaved: false, Previous: previous }, savingUserId, source);
  return row;
}

/** Serves every RunView from `answer` (by entity name and the ID of the user it runs as), so a read can fail without a database. */
function serveRunViews(answer: (entityName: string, userID: string | undefined) => { Success: boolean; Results: object[]; ErrorMessage?: string }): void {
  const runView = async (p: RunViewParams, user?: UserInfo) => answer(p.EntityName || '', user?.ID);
  // Test-double cast at the seam: the double implements only the RunView member the server entities call.
  vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runView } as unknown as RunView);
}

describe('MJMLEvaluationProtocolEntityServer.ValidateAsync (who may change the guard fields of a protocol lineage)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
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
  it('refuses a version that names a human author other than the saving user, or names one with no saving user', async () => {
    const relaxed = v2Of(v1, margin, { kind: 'human', userId: 'U-OTHER' });
    for (const savingUser of ['u-2', null]) {
      const result = await newProtocolRow(relaxed, v1, savingUser).ValidateAsync();
      expect(result.Success).toBe(false);
      expect(result.Errors.map((e) => [e.Source, e.Message])).toEqual([
        ['AuthoredBy', 'AuthoredBy names the user U-OTHER, but the version is saved by ' + (savingUser === null ? 'no user' : 'another user') + '; a version is authored by a user only when that user saves it.'],
      ]);
    }
  });
  it('saves a version whose human author is the saving user (IDs compared as UUIDs)', async () => {
    const result = await newProtocolRow(v2Of(v1, margin, { kind: 'human', userId: 'u-1' }), v1, 'U-1').ValidateAsync();
    expect([result.Success, result.Errors]).toEqual([true, []]);
  });
  it('judges the human author against the user the save is attributed to: the provider\'s user when no context user is set', async () => {
    const result = await newProtocolRow(v2Of(v1, margin, human), v1, 'U-1', 'provider').ValidateAsync();
    expect([result.Success, result.Errors]).toEqual([true, []]);
  });
  it('reads the previous version as the user the save is attributed to', async () => {
    const readAs: (string | undefined)[] = [];
    serveRunViews((_entity, userID) => {
      readAs.push(userID);
      return { Success: true, Results: [v1] };
    });
    const row = Object.create(MJMLEvaluationProtocolEntityServer.prototype) as MJMLEvaluationProtocolEntityServer;
    defineMembers(row, { ...v2Of(v1, margin, human), IsSaved: false }, 'U-1', 'provider');
    const result = await row.ValidateAsync();
    expect([result.Success, result.Errors, readAs]).toEqual([true, [], ['U-1']]);
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

/** The `MJ: ML Prediction Units` columns of `spec` as version `version` of lineage `lineageRootID` (label version 1). */
function unitColumnsOf(spec: PredictionUnitSpec, id: string, lineageRootID: string, version: number): PredictionUnitColumns {
  const columns = ProtocolRows.UnitDraftColumns({
    Name: spec.name, Description: null, UnitRows: spec.rows, LabelRule: spec.label.rule, LabelWindowDays: spec.label.windowDays,
    LabelGapDays: spec.label.gapDays, TaskType: spec.label.outcome, Censoring: spec.censoring, ChangeHistoryPolicy: spec.history,
    GroupKey: spec.groupKey, TemporalSpec: spec.temporal, DecisionSpec: spec.decision, IncumbentHeuristic: spec.incumbent,
  });
  return { ...columns, ID: id, LineageRootID: lineageRootID, Version: version, LabelVersion: 1, AuthoredBy: JSON.stringify(spec.authoredBy) };
}

describe('MJMLPredictionUnitEntityServer.ValidateAsync (which user reads the previous version)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('reads the previous version as the user the save is attributed to: the provider\'s user when no context user is set', async () => {
    const readAs: (string | undefined)[] = [];
    serveRunViews((_entity, userID) => {
      readAs.push(userID);
      return { Success: true, Results: [unitColumnsOf(countUnit, 'U-1', 'U-1', 1)] };
    });
    const row = Object.create(MJMLPredictionUnitEntityServer.prototype) as MJMLPredictionUnitEntityServer;
    defineMembers(row, { ...unitColumnsOf(countUnit, 'U-2', 'U-1', 2), IsSaved: false }, 'U-1', 'provider');
    // Every entity and field the unit names resolves, so the only read is the previous version.
    Object.defineProperty(row.ProviderToUse, 'EntityByName', { value: () => ({ FieldByName: () => ({}) }) });
    const result = await row.ValidateAsync();
    expect([result.Success, result.Errors, readAs]).toEqual([true, [], ['U-1']]);
  });
});

/** Well-formed row IDs for the pipeline tests: a pipeline refuses a malformed bound ID before reading anything. */
const UNIT_ID = '0A000000-0000-4000-8000-000000000001';
const PROTOCOL_ID = '0B000000-0000-4000-8000-000000000001';

/**
 * A new pipeline row bound to a unit and a protocol (either may be null) over a metadata provider double, saved by the
 * provider's user U-1 (no context user set); no leakage guard.
 */
function newPipelineRow(unitID: string | null, protocolID: string | null): MJMLTrainingPipelineEntityServer {
  const row = Object.create(MJMLTrainingPipelineEntityServer.prototype) as MJMLTrainingPipelineEntityServer;
  defineMembers(row, {
    IsSaved: false, Name: 'p', PredictionUnitID: unitID, EvaluationProtocolID: protocolID, LeakageGuard: null, SourceBindings: null, TargetEntityID: null,
  }, 'U-1', 'provider');
  return row;
}

describe('MJMLTrainingPipelineEntityServer.ValidateAsync (a failed read of the bound unit or protocol)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('reports a failed Prediction Unit read as a failed read, never as "not found"', async () => {
    serveRunViews(() => ({ Success: false, Results: [], ErrorMessage: 'timeout' }));
    const result = await newPipelineRow(UNIT_ID, null).ValidateAsync();
    expect(result.Success).toBe(false);
    expect(result.Errors.map((e) => [e.Source, e.Message])).toEqual([['PredictionUnitID', `Reading Prediction Unit ${UNIT_ID} failed: timeout`]]);
  });
  it('reports a failed Evaluation Protocol read as a failed read, never as "not found"', async () => {
    const unit = unitRowFixture();
    serveRunViews((entity) => (entity === 'MJ: ML Prediction Units' ? { Success: true, Results: [unit] } : { Success: false, Results: [], ErrorMessage: 'timeout' }));
    const result = await newPipelineRow(UNIT_ID, PROTOCOL_ID).ValidateAsync();
    expect(result.Success).toBe(false);
    expect(result.Errors.map((e) => [e.Source, e.Message])).toEqual([['EvaluationProtocolID', `Reading Evaluation Protocol ${PROTOCOL_ID} failed: timeout`]]);
  });
  it('still reports an absent unit as not found', async () => {
    serveRunViews(() => ({ Success: true, Results: [] }));
    const result = await newPipelineRow(UNIT_ID, null).ValidateAsync();
    expect(result.Errors.map((e) => [e.Source, e.Message])).toEqual([['PredictionUnitID', `Prediction Unit ${UNIT_ID} was not found`]]);
  });
  it('reads the bound rows as the user the save is attributed to: the provider\'s user when no context user is set', async () => {
    const readAs: (string | undefined)[] = [];
    serveRunViews((_entity, userID) => {
      readAs.push(userID);
      return { Success: true, Results: [] };
    });
    await newPipelineRow(UNIT_ID, PROTOCOL_ID).ValidateAsync();
    expect(readAs).toEqual(['U-1', 'U-1']);
  });
});

describe('MJMLTrainingPipelineEntityServer.ValidateAsync (a bound protocol with no unit)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  const draft = EvaluationProtocolRules.DefaultEvaluationProtocolDraft({ Unit: countUnit, Holdout: seeded, Candidates: 1, Seed: 0, Name: 'p' });
  const protocol = EvaluationProtocolRules.EvaluationProtocolColumnsFromDraft(draft, { ID: PROTOCOL_ID, LineageRootID: PROTOCOL_ID, Version: 1, AuthoredBy: human });
  const errorsOf = (result: ValidationResult): string[][] => result.Errors.map((e) => [e.Source, e.Message]);

  it('refuses a malformed protocol ID (and a malformed unit ID) without reading anything', async () => {
    const reads: string[] = [];
    serveRunViews((entity) => {
      reads.push(entity);
      return { Success: true, Results: [] };
    });
    expect(errorsOf(await newPipelineRow(null, 'not-a-uuid').ValidateAsync())).toEqual([['EvaluationProtocolID', 'EvaluationProtocolID "not-a-uuid" is not a valid ID']]);
    expect(errorsOf(await newPipelineRow('U-9', PROTOCOL_ID).ValidateAsync())).toEqual([['PredictionUnitID', 'PredictionUnitID "U-9" is not a valid ID']]);
    expect(reads).toEqual([]);
  });
  it('reports an absent protocol as not found, and a failed read as a failed read', async () => {
    serveRunViews(() => ({ Success: true, Results: [] }));
    expect(errorsOf(await newPipelineRow(null, PROTOCOL_ID).ValidateAsync())).toEqual([['EvaluationProtocolID', `Evaluation Protocol ${PROTOCOL_ID} was not found`]]);
    vi.restoreAllMocks();
    serveRunViews(() => ({ Success: false, Results: [], ErrorMessage: 'timeout' }));
    expect(errorsOf(await newPipelineRow(null, PROTOCOL_ID).ValidateAsync())).toEqual([['EvaluationProtocolID', `Reading Evaluation Protocol ${PROTOCOL_ID} failed: timeout`]]);
  });
  it('refuses a protocol that does not parse, and saves one that does', async () => {
    serveRunViews(() => ({ Success: true, Results: [{ ...protocol, Holdout: '{"kind":"sideways"}' }] }));
    const unparseable = errorsOf(await newPipelineRow(null, PROTOCOL_ID).ValidateAsync());
    expect(unparseable.map(([source]) => source)).toEqual(['EvaluationProtocolID']);
    expect(unparseable[0][1]).toMatch(new RegExp(`^Evaluation Protocol ${PROTOCOL_ID} does not parse: `));
    vi.restoreAllMocks();
    serveRunViews(() => ({ Success: true, Results: [protocol] }));
    const result = await newPipelineRow(null, PROTOCOL_ID).ValidateAsync();
    expect([result.Success, result.Errors]).toEqual([true, []]);
  });
});

describe('MJMLTrainingPipelineEntityServer.ValidateAsync (rebinding a pipeline to another protocol)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  const P1 = '0C000000-0000-4000-8000-000000000001';
  const P2 = '0C000000-0000-4000-8000-000000000002';
  const Q1 = '0D000000-0000-4000-8000-000000000001';
  const draft = EvaluationProtocolRules.DefaultEvaluationProtocolDraft({ Unit: countUnit, Holdout: seeded, Candidates: 1, Seed: 0, Name: 'p' });
  const bound = EvaluationProtocolRules.EvaluationProtocolColumnsFromDraft(draft, { ID: P1, LineageRootID: P1, Version: 1, AuthoredBy: human });
  const humanOnly = { ...bound, GuardFieldsEditableBy: 'human-only' as const };
  const relaxedBy = (author: Actor, id = Q1, lineageRootId = id): EvaluationProtocolColumns => EvaluationProtocolRules.EvaluationProtocolColumnsFromDraft(
    { ...draft, promotion: { ...draft.promotion, margin: EvaluationProtocol.ToNonNegative(0.5) } }, { ID: id, LineageRootID: lineageRootId, Version: lineageRootId === id ? 1 : 2, AuthoredBy: author },
  );
  const agent: Actor = { kind: 'agent', agentRunId: 'AR-1' };
  const errorsOf = (result: ValidationResult): string[][] => result.Errors.map((e) => [e.Source, e.Message]);

  /**
   * A saved pipeline (no unit) whose EvaluationProtocolID changes from `fromId` to `toId`, saved by `savingUserId`
   * (null: no user) from `source`; protocol rows are served by ID.
   */
  function rebound(fromId: string, toId: string, rows: readonly EvaluationProtocolColumns[], savingUserId: string | null = 'U-1', source: SavingUserSource = 'context'): MJMLTrainingPipelineEntityServer {
    const runView = async (p: RunViewParams) => ({ Success: true, Results: rows.filter((r) => String(p.ExtraFilter || '').includes(`'${r.ID}'`)) });
    // Test-double cast at the seam: the double implements only the RunView member the pipeline server calls.
    vi.spyOn(RunView, 'FromMetadataProvider').mockReturnValue({ RunView: runView } as unknown as RunView);
    const row = Object.create(MJMLTrainingPipelineEntityServer.prototype) as MJMLTrainingPipelineEntityServer;
    const fields: Record<string, { Dirty: boolean; OldValue: string | null }> = { EvaluationProtocolID: { Dirty: true, OldValue: fromId } };
    defineMembers(row, {
      IsSaved: true, Name: 'p', PredictionUnitID: null, EvaluationProtocolID: toId, LeakageGuard: null, SourceBindings: null, TargetEntityID: null,
      GetFieldByName: (name: string) => fields[name] || { Dirty: false, OldValue: null },
    }, savingUserId, source);
    return row;
  }

  it('refuses a rebind to another lineage whose guard fields an agent tool call relaxed, naming the refused author', async () => {
    expect(errorsOf(await rebound(P1, Q1, [bound, relaxedBy(agent)]).ValidateAsync())).toEqual([[
      'EvaluationProtocolID',
      `Binding Evaluation Protocol ${Q1} in place of ${P1} (another lineage) changes the guard fields promotion, which ${P1}'s GuardFieldsEditableBy "non-agent" lets any author but an agent tool call change; refused for the target protocol's author (agent).`,
    ]]);
  });
  it('allows a rebind to another lineage whose guard fields a scheduled job set, under non-agent', async () => {
    const result = await rebound(P1, Q1, [bound, relaxedBy({ kind: 'scheduled-job', scheduledJobRunId: 'SJ-1' })]).ValidateAsync();
    expect([result.Success, result.Errors]).toEqual([true, []]);
  });
  it('refuses a rebind with no saving user under human-only, naming the rebinding actor', async () => {
    expect(errorsOf(await rebound(P1, Q1, [humanOnly, relaxedBy(human)], null).ValidateAsync())).toEqual([[
      'EvaluationProtocolID',
      `Binding Evaluation Protocol ${Q1} in place of ${P1} (another lineage) changes the guard fields promotion, guardFieldsEditableBy, which ${P1}'s GuardFieldsEditableBy "human-only" lets only a user change; refused for the rebinding actor (system: ML Training Pipeline save with no user).`,
    ]]);
  });
  it('allows a user to rebind under human-only to a protocol a user authored', async () => {
    const result = await rebound(P1, Q1, [humanOnly, relaxedBy(human)]).ValidateAsync();
    expect([result.Success, result.Errors]).toEqual([true, []]);
  });
  it('judges the rebind as the user the save is attributed to: the provider\'s user when no context user is set', async () => {
    const result = await rebound(P1, Q1, [humanOnly, relaxedBy(human)], 'U-1', 'provider').ValidateAsync();
    expect([result.Success, result.Errors]).toEqual([true, []]);
  });
  it('allows a forward move within the lineage (each version\'s own save checked its guard change)', async () => {
    const result = await rebound(P1, P2, [bound, relaxedBy(agent, P2, P1)]).ValidateAsync();
    expect([result.Success, result.Errors]).toEqual([true, []]);
  });
  it('refuses a downgrade to an earlier version of the lineage whose guard fields its author may not set under the later version', async () => {
    const v1 = EvaluationProtocolRules.EvaluationProtocolColumnsFromDraft(draft, { ID: P1, LineageRootID: P1, Version: 1, AuthoredBy: { kind: 'scheduled-job', scheduledJobRunId: 'SJ-1' } });
    const v2 = EvaluationProtocolRules.EvaluationProtocolColumnsFromDraft(
      { ...draft, guardFieldsEditableBy: 'human-only', promotion: { ...draft.promotion, margin: EvaluationProtocol.ToNonNegative(0.05) } },
      { ID: P2, LineageRootID: P1, Version: 2, AuthoredBy: human },
    );
    expect(errorsOf(await rebound(P2, P1, [v1, v2]).ValidateAsync())).toEqual([[
      'EvaluationProtocolID',
      `Binding Evaluation Protocol ${P1} in place of ${P2} (a downgrade from version 2 to version 1 of the same lineage) changes the guard fields promotion, guardFieldsEditableBy, which ${P2}'s GuardFieldsEditableBy "human-only" lets only a user change; refused for the target protocol's author (scheduled-job).`,
    ]]);
  });
  it('allows a downgrade whose guard fields are unchanged, even to a version an agent tool call authored', async () => {
    const v1 = { ...bound, AuthoredBy: JSON.stringify(agent) };
    const v2 = { ...bound, ID: P2, Version: 2, Name: 'renamed' };
    const result = await rebound(P2, P1, [v1, v2]).ValidateAsync();
    expect([result.Success, result.Errors]).toEqual([true, []]);
  });
});

/** A unit row (any parseable shape): the protocol read fails before the unit is parsed. */
function unitRowFixture(): { ID: string } {
  return { ID: UNIT_ID };
}

/** The members a Save override reads: the row identity, plus what a refusal records (entity name, result history). */
interface SaveDoubleMembers {
  IsSaved: boolean;
  Version: number;
  ID: string;
  LineageRootID: string;
  EntityInfo?: { Name: string };
  _resultHistory?: BaseEntityResult[];
}

/** A server entity object with only the members the Save override reads, so no database or metadata is needed. */
function newRowOf<T extends object>(ctor: { prototype: T }, members: SaveDoubleMembers): T {
  const row = Object.create(ctor.prototype) as T;
  for (const [name, value] of Object.entries(members)) {
    Object.defineProperty(row, name, { value, writable: true, configurable: true });
  }
  return row;
}

/** A versioned server row class: the members the Save override reads. */
type VersionedRowClass = { prototype: { IsSaved: boolean; Version: number; ID: string; LineageRootID: string; Save(): Promise<boolean> } };
const versionedRowClasses: readonly (readonly [string, VersionedRowClass])[] = [
  ['MJ: ML Prediction Units', MJMLPredictionUnitEntityServer],
  ['MJ: ML Evaluation Protocols', MJMLEvaluationProtocolEntityServer],
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
    expect(await blank.Save()).toBe(true);
    expect(blank.LineageRootID).toBe('ID-2');
  });
  it('leaves a later version and a saved row alone', async () => {
    vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
    const later = newRowOf(ctor, { IsSaved: false, Version: 2, ID: 'ID-3', LineageRootID: 'ROOT' });
    expect(await later.Save()).toBe(true);
    expect(later.LineageRootID).toBe('ROOT');
    const saved = newRowOf(ctor, { IsSaved: true, Version: 1, ID: 'ID-4', LineageRootID: 'ROOT' });
    expect(await saved.Save()).toBe(true);
    expect(saved.LineageRootID).toBe('ROOT');
  });
});

/** An immutable-version server row class: the members its Save override reads and records. */
type ImmutableRowClass = { prototype: { IsSaved: boolean; Save(options?: EntitySaveOptions): Promise<boolean>; readonly LatestResult: BaseEntityResult | null } };
const immutableRowClasses: readonly (readonly [string, ImmutableRowClass])[] = [
  ['MJ: ML Prediction Units', MJMLPredictionUnitEntityServer],
  ['MJ: ML Evaluation Protocols', MJMLEvaluationProtocolEntityServer],
  ['MJ: ML Training Snapshots', MJMLTrainingSnapshotEntityServer],
];

describe.each(immutableRowClasses)('%s Save with ReplayOnly (which skips Validate but still writes)', (entityName, ctor) => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  const replayOnly = Object.assign(new EntitySaveOptions(), { ReplayOnly: true });
  const rowOf = (isSaved: boolean) => newRowOf(ctor, { IsSaved: isSaved, Version: 2, ID: 'ID-1', LineageRootID: 'ROOT', EntityInfo: { Name: entityName }, _resultHistory: [] });

  it('refuses a ReplayOnly save of a saved row without writing, and says why', async () => {
    const baseSave = vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
    const saved = rowOf(true);
    expect(await saved.Save(replayOnly)).toBe(false);
    expect(baseSave).not.toHaveBeenCalled();
    expect([saved.LatestResult?.Success, saved.LatestResult?.Type, saved.LatestResult?.CompleteMessage]).toEqual([
      false, 'update',
      `${entityName} rows are immutable once saved; a ReplayOnly save of a saved row is refused, because ReplayOnly skips the validation that refuses the update but still writes.`,
    ]);
  });
  it('passes a ReplayOnly insert, and an ordinary save of a saved row, to the base save', async () => {
    const baseSave = vi.spyOn(BaseEntity.prototype, 'Save').mockResolvedValue(true);
    expect(await rowOf(false).Save(replayOnly)).toBe(true);
    expect(await rowOf(true).Save()).toBe(true);
    expect(baseSave).toHaveBeenCalledTimes(2);
  });
});

describe('ExpectedLabelVersion', () => {
  it('is the previous LabelVersion, plus one when the outcome definition changed', () => {
    expect(MJMLPredictionUnitEntityServer.ExpectedLabelVersion(3, false)).toBe(3);
    expect(MJMLPredictionUnitEntityServer.ExpectedLabelVersion(3, true)).toBe(4);
  });
});
