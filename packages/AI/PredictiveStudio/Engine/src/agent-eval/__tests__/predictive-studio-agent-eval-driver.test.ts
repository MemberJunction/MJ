import { describe, expect, it, vi } from 'vitest';
import { EntityInfo, UserInfo, type IMetadataProvider, type RunViewParams } from '@memberjunction/core';
import type { MJAIAgentEntity, MJAIAgentRunEntity, MJTestEntity, MJTestRunEntity } from '@memberjunction/core-entities';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentEvalConfig, DriverExecutionContext, OracleInput, RubricOracleEngine, SuiteFixtureContext } from '@memberjunction/testing-engine';
import {
  AgentEvalScenarioManifest,
  PS_RUBRIC_ORACLE_TYPE,
  PSRubricOracle,
  PredictiveStudioAgentEvalDriver,
  type AgentEvalManifest,
} from '../index';

interface InMemoryNote {
  ID: string;
  AgentID: string;
  UserID: string | null;
  Status: string;
  SourceAIAgentRunID: string | null;
  Note: string;
}

interface InMemoryAgentRun {
  ID: string;
  AgentID: string;
  RootParentRunID: string | null;
  ParentRunID: string | null;
  LastRunID: string | null;
  TestRunID: string | null;
  Status: string;
  TotalCost: number;
  FinalPayload: string;
  Message: string;
}

function MakeUser(): UserInfo {
  return new UserInfo(null, { ID: '00000000-0000-4000-8000-0000000000aa', Email: 'eval@example.com', Type: 'User' });
}

function MakeEntity(name: string): EntityInfo {
  return new EntityInfo({ ID: `ent-${name}`, Name: name, BaseTable: name, BaseView: `vw${name}` });
}

class MemoryAndMetadataFake {
  public readonly Notes: InMemoryNote[] = [];
  public readonly AgentRuns: InMemoryAgentRun[] = [];
  public readonly TestRuns: Array<{ ID: string; TestID: string; TestSuiteRunID: string | null; TargetLogID: string | null }> = [];
  public readonly Pipelines: Array<{ ID: string; Name: string; FeatureSteps: string; ExclusionList?: string }> = [];
  public readonly TrainingRuns: Array<{ ID: string; PipelineID: string; Status: string }> = [];
  public readonly Models: Array<{ ID: string; TrainingRunID: string; Status: string }> = [];
  public readonly DecisionLogs: Array<{ ID: string; AgentRunID: string; Decision: string; Rationale: string }> = [];
  public readonly Entities: EntityInfo[];

  public constructor(includeDecisionLog: boolean) {
    this.Entities = [
      MakeEntity('MJ: AI Agent Runs'),
      MakeEntity('MJ: AI Agent Notes'),
      MakeEntity('MJ: Test Runs'),
      MakeEntity('MJ: Test Suites'),
      MakeEntity('MJ: Test Suite Runs'),
      MakeEntity('MJ: ML Training Pipelines'),
      MakeEntity('MJ: ML Training Runs'),
      MakeEntity('MJ: ML Models'),
      ...(includeDecisionLog ? [MakeEntity('MJ: Agent Decision Logs')] : []),
    ];
  }

  public BuildProvider(): IMetadataProvider {
    const self = this;
    const provider = {
      Entities: this.Entities,
      async RunView<T>(params: RunViewParams): Promise<{ Success: boolean; Results: T[]; ErrorMessage?: string }> {
        const entity = params.EntityName;
        const filter = params.ExtraFilter ?? '';
        const filterMatch = (val: string | null | undefined, needle: string) =>
          (val ?? '').toLowerCase() === needle.toLowerCase();

        if (entity === 'MJ: AI Agent Notes') {
          const filtered = self.Notes.filter((n) => {
            if (filter.includes("Status <> 'Archived'") && n.Status === 'Archived') return false;
            if (filter.includes('IN (')) {
              const ids = [...filter.matchAll(/'([^']+)'/g)].map((m) => m[1].toLowerCase());
              const hasSourceFilter = n.SourceAIAgentRunID && ids.includes(n.SourceAIAgentRunID.toLowerCase());
              return Boolean(hasSourceFilter);
            }
            if (filter.includes("Status='Active'") || filter.includes("Status='Provisional'")) {
              return n.Status !== 'Archived';
            }
            return true;
          });
          return { Success: true, Results: filtered as unknown as T[] };
        }
        if (entity === 'MJ: AI Agent Runs') {
          const ids = [...filter.matchAll(/'([^']+)'/g)].map((m) => m[1].toLowerCase());
          const filtered = ids.length === 0
            ? self.AgentRuns
            : self.AgentRuns.filter((r) =>
                ids.some((id) =>
                  filterMatch(r.ID, id) ||
                  filterMatch(r.RootParentRunID, id) ||
                  filterMatch(r.ParentRunID, id) ||
                  filterMatch(r.LastRunID, id) ||
                  filterMatch(r.TestRunID, id)
                )
              );
          return { Success: true, Results: filtered as unknown as T[] };
        }
        if (entity === 'MJ: Test Runs') {
          const ids = [...filter.matchAll(/'([^']+)'/g)].map((m) => m[1].toLowerCase());
          const filtered = ids.length === 0
            ? self.TestRuns
            : self.TestRuns.filter((tr) =>
                ids.some((id) => filterMatch(tr.TestID, id) || filterMatch(tr.TestSuiteRunID, id) || filterMatch(tr.ID, id))
              );
          return { Success: true, Results: filtered as unknown as T[] };
        }
        if (entity === 'MJ: Agent Decision Logs') {
          const ids = [...filter.matchAll(/'([^']+)'/g)].map((m) => m[1].toLowerCase());
          const filtered = ids.length === 0
            ? self.DecisionLogs
            : self.DecisionLogs.filter((d) => ids.includes(d.AgentRunID.toLowerCase()));
          return { Success: true, Results: filtered as unknown as T[] };
        }
        if (entity === 'MJ: ML Training Runs') {
          return { Success: true, Results: self.TrainingRuns as unknown as T[] };
        }
        if (entity === 'MJ: ML Models') {
          return { Success: true, Results: self.Models as unknown as T[] };
        }
        if (entity === 'MJ: ML Training Pipelines') {
          return { Success: true, Results: self.Pipelines as unknown as T[] };
        }
        return { Success: true, Results: [] };
      },
      async GetEntityObject<T>(entityName: string): Promise<T> {
        if (entityName === 'MJ: AI Agent Notes') {
          let record: InMemoryNote | undefined;
          const entityObj = {
            get ID() { return record?.ID ?? ''; },
            get Status() { return record?.Status ?? 'Provisional'; },
            set Status(v: string) { if (record) record.Status = v; },
            get SourceAIAgentRunID() { return record?.SourceAIAgentRunID ?? null; },
            LatestResult: { CompleteMessage: '', Errors: [] },
            async Load(id: string) {
              record = self.Notes.find((n) => n.ID.toLowerCase() === id.toLowerCase());
              return Boolean(record);
            },
            async Save() {
              return Boolean(record);
            },
          };
          return entityObj as unknown as T;
        }
        throw new Error(`Unexpected GetEntityObject(${entityName})`);
      },
    };
    return provider as unknown as IMetadataProvider;
  }
}

class HarnessDriver extends PredictiveStudioAgentEvalDriver {
  public readonly ExecuteAgentCalls: Array<{ testRunId: string; visibleNoteIdsAtStart: string[] }> = [];
  private readonly fake: MemoryAndMetadataFake;
  private readonly scriptedPayloadByTestRun: Map<string, Record<string, unknown>> = new Map();

  public constructor(fake: MemoryAndMetadataFake) {
    super();
    this.fake = fake;
    this.SetProvider(fake.BuildProvider());
  }

  public ScriptRun(testRunId: string, payload: Record<string, unknown>): void {
    this.scriptedPayloadByTestRun.set(testRunId, payload);
  }

  protected override async loadAgent(agentId: string): Promise<MJAIAgentEntity> {
    return { ID: agentId, Name: 'Model Development Agent' } as unknown as MJAIAgentEntity;
  }

  protected override async LoadSuites(): Promise<{ suiteId?: string; suites: [] }> {
    return { suites: [] };
  }

  protected override async LoadAgentEvaluationRubric(): Promise<undefined> {
    return undefined;
  }

  protected override async executeAgent(
    agent: MJAIAgentEntity,
    input: { userMessage?: string },
    _contextUser: UserInfo,
    _test: MJTestEntity,
    _maxExecutionTime: number | undefined,
    testRun: MJTestRunEntity
  ) {
    const visibleNotes = this.fake.Notes.filter((n) => n.Status !== 'Archived').map((n) => n.ID);
    this.ExecuteAgentCalls.push({ testRunId: testRun.ID, visibleNoteIdsAtStart: visibleNotes });

    const rootRunId = `agent-run-${testRun.ID}`;
    const childRunId = `child-run-${testRun.ID}`;
    const nextTurnRunId = `turn2-run-${testRun.ID}`;
    const payload = this.scriptedPayloadByTestRun.get(testRun.ID) ?? {};

    this.fake.AgentRuns.push(
      {
        ID: rootRunId,
        AgentID: agent.ID,
        RootParentRunID: null,
        ParentRunID: null,
        LastRunID: nextTurnRunId,
        TestRunID: testRun.ID,
        Status: 'Completed',
        TotalCost: 0.01,
        FinalPayload: JSON.stringify(payload),
        Message: 'Completed',
      },
      {
        ID: childRunId,
        AgentID: agent.ID,
        RootParentRunID: rootRunId,
        ParentRunID: rootRunId,
        LastRunID: null,
        TestRunID: null,
        Status: 'Completed',
        TotalCost: 0,
        FinalPayload: '{}',
        Message: 'Sub-agent',
      },
      {
        ID: nextTurnRunId,
        AgentID: agent.ID,
        RootParentRunID: null,
        ParentRunID: null,
        LastRunID: null,
        TestRunID: null,
        Status: 'Completed',
        TotalCost: 0,
        FinalPayload: JSON.stringify(payload),
        Message: 'Turn 2',
      }
    );

    if (testRun.ID === 'test-run-1') {
      // Repeat 1 writes notes attached to root run, child run, and LastRunID chain
      this.fake.Notes.push(
        { ID: 'note-r1-root', AgentID: agent.ID, UserID: null, Status: 'Provisional', SourceAIAgentRunID: rootRunId, Note: 'Root note' },
        { ID: 'note-r1-child', AgentID: agent.ID, UserID: null, Status: 'Provisional', SourceAIAgentRunID: childRunId, Note: 'Child note' },
        { ID: 'note-r1-turn2', AgentID: agent.ID, UserID: null, Status: 'Provisional', SourceAIAgentRunID: nextTurnRunId, Note: 'Turn 2 note' }
      );
      // Concurrent unrelated test creates a note during repeat 1
      this.fake.Notes.push({
        ID: 'note-other-test',
        AgentID: agent.ID,
        UserID: null,
        Status: 'Provisional',
        SourceAIAgentRunID: 'other-test-run-tree',
        Note: 'Other test note',
      });
    }

    const agentRunEntity = {
      ID: rootRunId,
      Status: 'Completed',
      TotalCost: 0.01,
      StartedAt: new Date('2026-11-26T00:00:00Z'),
      CompletedAt: new Date('2026-11-26T00:00:01Z'),
      FinalPayload: JSON.stringify(payload),
      Message: 'Completed',
    } as unknown as MJAIAgentRunEntity;

    return {
      agentRuns: [agentRunEntity],
      turnResults: [
        {
          turnNumber: 1,
          inputPayload: { userMessage: input.userMessage },
          outputPayload: payload,
          agentRun: agentRunEntity,
          cost: 0.01,
          durationMs: 1000,
        },
      ],
      timedOut: false,
    };
  }
}

function MakeContext(
  testId: string,
  testRunId: string,
  oracles: Array<{ type: string; config?: Record<string, unknown> }>,
  workerIndex?: number,
  fixtures?: SuiteFixtureContext
): DriverExecutionContext {
  const configJson = JSON.stringify({
    agentId: '12F06453-2DAE-402A-91EE-ED851C4739D6',
    oracles,
  });
  return {
    test: {
      ID: testId,
      Name: 'Test scenario',
      Configuration: configJson,
      InputDefinition: JSON.stringify({ userMessage: 'Evaluate model' }),
      ExpectedOutcomes: JSON.stringify({}),
      RubricID: null,
    } as unknown as MJTestEntity,
    testRun: {
      ID: testRunId,
      TestID: testId,
      TestSuiteRunID: fixtures?.SuiteRunID ?? 'suite-run-1',
    } as unknown as MJTestRunEntity,
    contextUser: MakeUser(),
    options: {},
    oracleRegistry: new Map(),
    workerIndex,
    fixtures,
  } as unknown as DriverExecutionContext;
}

describe('PredictiveStudioAgentEvalDriver — Attacks 3, 7, 8', () => {
  it('Attack 3: isolates repeat notes via SourceAIAgentRunID run tree without touching other tests', async () => {
    const fake = new MemoryAndMetadataFake(true);
    const driver = new HarnessDriver(fake);

    const testId = 'test-isolated-1';
    fake.TestRuns.push({ ID: 'test-run-1', TestID: testId, TestSuiteRunID: 'suite-run-1', TargetLogID: null });
    fake.TestRuns.push({ ID: 'test-run-2', TestID: testId, TestSuiteRunID: 'suite-run-1', TargetLogID: null });

    const r1 = await driver.Execute(MakeContext(testId, 'test-run-1', [{ type: 'builds-started', config: { expectedCount: 0 } }]));
    expect(r1.status).toBe('Passed');

    // Verify all 3 notes in repeat 1's run tree were archived and the unrelated test's note stayed untouched.
    expect(fake.Notes.find((n) => n.ID === 'note-r1-root')?.Status).toBe('Archived');
    expect(fake.Notes.find((n) => n.ID === 'note-r1-child')?.Status).toBe('Archived');
    expect(fake.Notes.find((n) => n.ID === 'note-r1-turn2')?.Status).toBe('Archived');
    expect(fake.Notes.find((n) => n.ID === 'note-other-test')?.Status).toBe('Provisional');

    // Simulate a stray unarchived note from repeat 1 left behind before repeat 2 starts.
    fake.Notes[0].Status = 'Provisional';

    const r2 = await driver.Execute(MakeContext(testId, 'test-run-2', [{ type: 'builds-started', config: { expectedCount: 0 } }]));
    expect(r2.status).toBe('Passed');
    // Repeat 2 must not see any note ID from repeat 1 in its active notes when executeAgent starts.
    expect(driver.ExecuteAgentCalls[1].visibleNoteIdsAtStart).not.toContain('note-r1-root');
    expect(driver.ExecuteAgentCalls[1].visibleNoteIdsAtStart).not.toContain('note-r1-child');
    expect(driver.ExecuteAgentCalls[1].visibleNoteIdsAtStart).not.toContain('note-r1-turn2');
    expect(fake.Notes.find((n) => n.ID === 'note-other-test')?.Status).toBe('Provisional');
  });

  it('Attack 7: refuses parallel runs with parallel-refused and starts 0 agent runs, while sequential runs succeed', async () => {
    const fake = new MemoryAndMetadataFake(true);
    const driver = new HarnessDriver(fake);
    const spy = vi.spyOn(driver as unknown as { executeAgent: (...args: unknown[]) => unknown }, 'executeAgent');

    const parallelResult = await driver.Execute(
      MakeContext('test-par', 'test-run-par', [{ type: 'builds-started', config: { expectedCount: 0 } }], 0)
    );
    expect(parallelResult.status).toBe('Failed');
    expect(parallelResult.errorMessage).toContain('parallel-refused');
    expect(parallelResult.oracleResults[0]?.oracleType).toBe('parallel-refused');
    expect(spy).not.toHaveBeenCalled();

    const seqResult = await driver.Execute(
      MakeContext('test-seq', 'test-run-seq', [{ type: 'builds-started', config: { expectedCount: 0 } }], undefined)
    );
    expect(seqResult.status).toBe('Passed');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('Attack 8: treats missing MJ: Agent Decision Logs entity on baseline DB as 0 rows and fails cleanly without throwing', async () => {
    const fake = new MemoryAndMetadataFake(false); // No MJ: Agent Decision Logs in metadata!
    const driver = new HarnessDriver(fake);

    const ctx = MakeContext('test-baseline-missing-log', 'test-run-baseline', [
      { type: 'refusal-kind', config: { expectedDecision: 'decline-no-signal' } },
    ]);

    const result = await driver.Execute(ctx);
    expect(result.status).toBe('Failed');
    const refusalOracle = result.oracleResults.find((o) => o.oracleType === 'refusal-kind');
    expect(refusalOracle).toBeDefined();
    expect(refusalOracle?.passed).toBe(false);
    expect(refusalOracle?.message).toMatch(/0 rows|not present|absent/i);
  });
});

describe('PSRubricOracle — judges only the criteria a test names (D5-59)', () => {
  const RUBRIC_ID = '2056F86A-FB34-4222-855C-275C7A36467A';
  const VERSION_ID = '267FF292-E94E-4ABC-AC40-BB7088324AD3';
  const KEYS = ['censoring-named', 'asks-what-to-improve', 'failure-reported'];

  type JudgedCriterion = { key: string; normalizedScore: number | null; rationale?: string };
  type EvaluateRecordInput = Parameters<RubricOracleEngine['EvaluateRecord']>[0];

  /** A rubric engine whose judge returns fixed criterion scores, recording every call. */
  function MakeEngine(scores: Record<string, number>): RubricOracleEngine & { Calls: EvaluateRecordInput[] } {
    const calls: EvaluateRecordInput[] = [];
    return {
      Calls: calls,
      async EvaluateRecord(input: EvaluateRecordInput) {
        calls.push(input);
        const criteria: JudgedCriterion[] = KEYS.map((key) => ({ key, normalizedScore: scores[key] ?? 0, rationale: `${key} judged` }));
        const all = criteria.every((c) => c.normalizedScore === 1);
        return { evaluationId: 'eval-1', score: all ? 1 : 0, outcome: all ? 'Passed' : 'BelowThreshold', criteria };
      },
    };
  }

  /** A provider holding one published rubric version with the three PS criteria. */
  function MakeRubricProvider(): IMetadataProvider {
    const provider = {
      Entities: [MakeEntity('MJ: Rubric Versions'), MakeEntity('MJ: Rubric Criteria')],
      async RunView<T>(params: RunViewParams): Promise<{ Success: boolean; Results: T[] }> {
        if (params.EntityName === 'MJ: Rubric Versions') return { Success: true, Results: [{ ID: VERSION_ID }] as unknown as T[] };
        if (params.EntityName === 'MJ: Rubric Criteria') {
          const matches = (params.ExtraFilter ?? '').includes(VERSION_ID);
          return { Success: true, Results: (matches ? KEYS.map((Key) => ({ Key })) : []) as unknown as T[] };
        }
        return { Success: true, Results: [] };
      },
    };
    return provider as unknown as IMetadataProvider;
  }

  function MakeInput(): OracleInput {
    return {
      test: { ID: 'test-1', InputDefinition: { userMessage: 'rebuild it' } } as unknown as MJTestEntity,
      actualOutput: 'What should the rebuild improve: the metric, a feature, or a segment?',
      contextUser: MakeUser(),
      testRunId: 'test-run-1',
      provider: MakeRubricProvider(),
    };
  }

  it('passes when the one named criterion is Met, though the unnamed ones are Not met', async () => {
    const engine = MakeEngine({ 'asks-what-to-improve': 1, 'censoring-named': 0, 'failure-reported': 0 });
    const result = await new PSRubricOracle(engine).evaluate(MakeInput(), { rubricId: RUBRIC_ID, criteriaKeys: ['asks-what-to-improve'] });
    expect(result.oracleType).toBe(PS_RUBRIC_ORACLE_TYPE);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
    expect(engine.Calls).toHaveLength(1);
    expect(engine.Calls[0].versionId).toBe(VERSION_ID);
  });

  it('fails when the named criterion is Not met, though every unnamed one is Met', async () => {
    const engine = MakeEngine({ 'asks-what-to-improve': 0, 'censoring-named': 1, 'failure-reported': 1 });
    const result = await new PSRubricOracle(engine).evaluate(MakeInput(), { rubricId: RUBRIC_ID, criteriaKeys: ['asks-what-to-improve'] });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it('needs every named criterion Met when a test names two', async () => {
    const engine = MakeEngine({ 'asks-what-to-improve': 1, 'failure-reported': 0 });
    const result = await new PSRubricOracle(engine).evaluate(MakeInput(), {
      rubricId: RUBRIC_ID,
      rubricVersionId: VERSION_ID,
      criteriaKeys: ['asks-what-to-improve', 'failure-reported'],
    });
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0.5);
  });

  it('refuses a key the rubric version does not define, before any judge call', async () => {
    const engine = MakeEngine({ 'asks-what-to-improve': 1 });
    const result = await new PSRubricOracle(engine).evaluate(MakeInput(), { rubricId: RUBRIC_ID, criteriaKeys: ['asks-what-to-improve', 'tone-polite'] });
    expect(result.passed).toBe(false);
    expect(result.message).toMatch(/^ps-rubric-unknown-criterion:/);
    expect(result.details).toEqual({ Refusal: 'unknown-criterion', UnknownKeys: ['tone-polite'] });
    expect(engine.Calls).toHaveLength(0);
  });

  it('refuses an empty criteria list, before any judge call', async () => {
    const engine = MakeEngine({});
    const result = await new PSRubricOracle(engine).evaluate(MakeInput(), { rubricId: RUBRIC_ID, criteriaKeys: [] });
    expect(result.passed).toBe(false);
    expect(result.details).toEqual({ Refusal: 'no-criteria' });
    expect(engine.Calls).toHaveLength(0);
  });

  it("judges the agent's final message, not only the payload, when the driver supplied no judge evidence (wave-4 integration)", async () => {
    const engine = MakeEngine({ 'failure-reported': 1 });
    const decline = "I can't build a reliable model from this data: the development rows hold 180 resolved rows, 15 of them in the smaller outcome class.";
    const input: OracleInput = {
      ...MakeInput(),
      actualOutput: { TargetDefinition: { EntityName: 'PS Truth: C1CommitteeMembership' } },
      targetEntity: { ID: 'run-1', Message: decline, FinalPayload: '{"TargetDefinition":{"EntityName":"PS Truth: C1CommitteeMembership"}}' },
    };
    await new PSRubricOracle(engine).evaluate(input, { rubricId: RUBRIC_ID, criteriaKeys: ['failure-reported'] });
    const text = engine.Calls[0].content?.text ?? '';
    expect(text).toContain('=== Agent final message ===');
    expect(text).toContain(decline);
    expect(text).toContain('=== Agent final payload (JSON) ===');
    expect(text.indexOf(decline)).toBeLessThan(text.indexOf('C1CommitteeMembership'));
  });

  it("keeps the driver's own judge evidence when it supplied some", async () => {
    const engine = MakeEngine({ 'failure-reported': 1 });
    const input: OracleInput = {
      ...MakeInput(),
      targetEntity: { ID: 'run-1', Message: 'not this', FinalPayload: '{}' },
      judgeEvidence: { Items: [{ Label: 'Agent final message', Text: 'the driver evidence', Truncated: false }], Truncated: false },
    };
    await new PSRubricOracle(engine).evaluate(input, { rubricId: RUBRIC_ID, criteriaKeys: ['failure-reported'] });
    const text = engine.Calls[0].content?.text ?? '';
    expect(text).toContain('the driver evidence');
    expect(text).not.toContain('not this');
  });

  it('the generated tests name ps-rubric only with criteria, never the generic rubric oracle', () => {
    const manifest = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'scenario-manifest.json'), 'utf8')
    ) as AgentEvalManifest;
    const { tests } = AgentEvalScenarioManifest.GenerateMetadata(manifest) as { tests: readonly { fields: { Name: string; Configuration: { oracles: readonly { type: string; config?: { criteriaKeys?: readonly string[] } }[] } } }[] };
    const byName = new Map(manifest.scenarios.map((s) => [s.name, s]));
    for (const test of tests) {
      const oracles = test.fields.Configuration.oracles;
      expect(oracles.some((o) => o.type === 'rubric')).toBe(false);
      const named = byName.get(test.fields.Name)?.expected.rubricCriteria ?? [];
      const ps = oracles.filter((o) => o.type === PS_RUBRIC_ORACLE_TYPE);
      if (named.length === 0) expect(ps).toHaveLength(0);
      else expect(ps.map((o) => o.config?.criteriaKeys)).toEqual([named]);
    }
  });
});

describe('PredictiveStudioAgentEvalDriver.WithResolvedRubric — no implicit generic rubric oracle (D5-59)', () => {
  class ExposedDriver extends PredictiveStudioAgentEvalDriver {
    public Resolve(config: AgentEvalConfig, context: DriverExecutionContext): Promise<AgentEvalConfig> {
      return this.WithResolvedRubric(config, context);
    }
  }

  const RUBRIC_ID = '2056F86A-FB34-4222-855C-275C7A36467A';
  const PINNED = { id: '267ff292-e94e-4abc-ac40-bb7088324ad3', label: '1.0.0' };

  function MakeContext(): DriverExecutionContext {
    return {
      contextUser: MakeUser(),
      test: { ID: 'test-1', RubricID: RUBRIC_ID } as unknown as MJTestEntity,
      testRun: { ID: 'run-1', TestSuiteRunID: 'suite-run-1' } as unknown as MJTestRunEntity,
      fixtures: { SuiteRunID: 'suite-run-1', Data: {}, PinnedRubricVersions: { [RUBRIC_ID.toLowerCase()]: PINNED } },
      options: {},
      oracleRegistry: new Map(),
    } as unknown as DriverExecutionContext;
  }

  it('adds no rubric oracle to a test without criteria, though the test and its suites name a rubric', async () => {
    const config: AgentEvalConfig = { agentId: 'agent-1', oracles: [{ type: 'builds-started', config: { expectedCount: 0 } }] };
    const resolved = await new ExposedDriver().Resolve(config, MakeContext());
    expect(resolved.oracles.map((o) => o.type)).toEqual(['builds-started']);
  });

  it('pins a ps-rubric oracle to the suite run’s rubric version, matching the rubric ID in any case', async () => {
    const config: AgentEvalConfig = {
      agentId: 'agent-1',
      oracles: [{ type: PS_RUBRIC_ORACLE_TYPE, weight: 0.2, config: { rubricId: RUBRIC_ID, criteriaKeys: ['asks-what-to-improve'] } }],
    };
    const resolved = await new ExposedDriver().Resolve(config, MakeContext());
    expect(resolved.oracles).toEqual([
      {
        type: PS_RUBRIC_ORACLE_TYPE,
        weight: 0.2,
        config: { rubricId: RUBRIC_ID, criteriaKeys: ['asks-what-to-improve'], rubricVersionId: PINNED.id, versionLabel: PINNED.label },
      },
    ]);
  });
});
