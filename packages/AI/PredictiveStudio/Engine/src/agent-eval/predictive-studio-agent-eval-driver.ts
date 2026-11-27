import { RunView, type EntityInfo, type UserInfo } from '@memberjunction/core';
import type { MJAIAgentNoteEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, NormalizeUUID, RegisterClass, UUIDsEqual } from '@memberjunction/global';
import {
  AgentEvalDriver,
  BaseTestDriver,
  type DriverExecutionContext,
  type DriverExecutionResult,
  type IOracle,
  type OracleConfig,
  type OracleInput,
  type OracleResult,
  type SuiteFixtureContext,
} from '@memberjunction/testing-engine';
import type { AgentEvalWorldId } from './types';

/** Maximum rows fetched per run-tree hop during memory-isolation expansion (F-L3-1 safety). */
const MAX_RUN_TREE_ROWS = 500; // Bounded batch size for RunView queries across a single repeat run tree
/** Maximum rows fetched when listing notes created within a repeat's run tree. */
const MAX_NOTES_PER_RUN_TREE = 500; // Bounded batch size for repeat note archival
/** Maximum BFS hops when traversing agent run parent/continuation chains. */
const MAX_RUN_TREE_HOPS = 25; // Prevents infinite loops on malformed parent/last-run links
/** Predictive Studio agent IDs whose persisted notes must be isolated per repeat (D5-33). */
const PS_AGENT_IDS: ReadonlySet<string> = new Set([
  '12f06453-2dae-402a-91ee-ed851c4739d6', // Model Development Agent
  'a0d87d05-4f80-44cb-a4dc-7e73e0000eda', // legacy alias guard
  'a0d87d05-4f80-44cb-a4dc-7e73e0c70eda', // Goal Analyst
  'a053d1cb-b7de-4094-ade1-abc3a13ccd7b', // Data Scout
  '58a39329-ba57-4f1b-a93a-65596e552c1c', // Experiment Designer
  '3ef80176-deef-492b-97bf-b889dd404b64', // Pipeline Builder
]);
const PIPELINE_BUILDER_AGENT_ID = '3EF80176-DEEF-492B-97BF-B889DD404B64';

/** Optional world loader hook invoked from SetupSuite when registered by a host harness. */
export type AgentEvalWorldLoader = (world: {
  readonly WorldId: AgentEvalWorldId;
  readonly WorldKind: 'corpus' | 'scenario' | 'world';
  readonly Seed?: number;
  readonly Context: SuiteFixtureContext;
  readonly ContextUser: UserInfo;
}) => Promise<void>;

/** Parses a JSON string safely into a plain record when valid. */
function ParseJsonRecord(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Reads a non-empty trimmed string value from an unknown cell or config property. */
function ReadString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/** Quotes an array of IDs safely for a SQL `IN (...)` clause. */
function FormatSqlStringList(ids: readonly string[]): string {
  return ids.map((id) => `'${EscapeSQLString(id)}'`).join(', ');
}

/** Finds whether an entity name exists in the metadata provider before querying it (D5-34). */
function FindEntityInfo(entities: readonly EntityInfo[], name: string): EntityInfo | undefined {
  return entities.find((e) => e.Name === name);
}

/**
 * Collects every `MJ: AI Agent Runs` ID in a repeat's run tree: seed IDs, descendants via
 * `RootParentRunID` / `ParentRunID`, and turn continuations via `LastRunID` — never by time window.
 */
async function ExpandRunTreeIds(
  provider: NonNullable<PredictiveStudioAgentEvalDriver['Provider']>,
  contextUser: UserInfo,
  seedRunIds: readonly string[],
  testRunId?: string
): Promise<string[]> {
  if (!FindEntityInfo(provider.Entities, 'MJ: AI Agent Runs')) {
    return [...new Set(seedRunIds.filter((id) => id.length > 0))];
  }

  const visited = new Set<string>();
  const frontier: string[] = [];
  const addId = (id: string | undefined | null): void => {
    const trimmed = ReadString(id);
    if (!trimmed) return;
    const normalized = NormalizeUUID(trimmed);
    if (!visited.has(normalized)) {
      visited.add(normalized);
      frontier.push(trimmed);
    }
  };

  for (const seed of seedRunIds) {
    addId(seed);
  }

  const rv = RunView.FromMetadataProvider(provider);

  // Include direct agent runs linked to this test run via TestRunID if present.
  const cleanTestRunId = ReadString(testRunId);
  if (cleanTestRunId) {
    const linked = await rv.RunView<Record<string, unknown>>(
      {
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: `TestRunID='${EscapeSQLString(cleanTestRunId)}'`,
        ResultType: 'simple',
        MaxRows: MAX_RUN_TREE_ROWS,
      },
      contextUser
    );
    if (linked.Success) {
      for (const row of linked.Results ?? []) {
        addId(ReadString(row['ID']));
        addId(ReadString(row['LastRunID']));
      }
    }
  }

  let hop = 0;
  while (frontier.length > 0 && hop < MAX_RUN_TREE_HOPS) {
    hop += 1;
    const batch = frontier.splice(0, frontier.length);
    const idList = FormatSqlStringList(batch);
    const filter = `ID IN (${idList}) OR RootParentRunID IN (${idList}) OR ParentRunID IN (${idList})`;
    const found = await rv.RunView<Record<string, unknown>>(
      {
        EntityName: 'MJ: AI Agent Runs',
        ExtraFilter: filter,
        ResultType: 'simple',
        MaxRows: MAX_RUN_TREE_ROWS,
      },
      contextUser
    );
    if (!found.Success) {
      throw new Error(found.ErrorMessage || 'Could not query MJ: AI Agent Runs for run tree.');
    }
    for (const row of found.Results ?? []) {
      addId(ReadString(row['ID']));
      addId(ReadString(row['LastRunID']));
    }
  }

  return Array.from(visited);
}

/** Deterministic oracle checking count of pipeline builds started within a repeat's run tree. */
class BuildsStartedOracle implements IOracle {
  public readonly type = 'builds-started';

  public async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
    const expectedCount = typeof config['expectedCount'] === 'number' ? config['expectedCount'] : 0;
    const targetRun = input.targetEntity as { ID?: string } | undefined;
    const rootRunId = ReadString(targetRun?.ID);
    const provider = input.provider;
    if (!provider || !rootRunId) {
      return { oracleType: this.type, passed: false, score: 0, message: 'Missing provider or agent run ID.' };
    }

    const runTreeIds = await ExpandRunTreeIds(provider, input.contextUser, [rootRunId], input.testRunId);
    let buildCount = 0;

    if (FindEntityInfo(provider.Entities, 'MJ: AI Agent Runs') && runTreeIds.length > 0) {
      const rv = RunView.FromMetadataProvider(provider);
      const runs = await rv.RunView<Record<string, unknown>>(
        {
          EntityName: 'MJ: AI Agent Runs',
          ExtraFilter: `ID IN (${FormatSqlStringList(runTreeIds)})`,
          ResultType: 'simple',
          MaxRows: MAX_RUN_TREE_ROWS,
        },
        input.contextUser
      );
      if (runs.Success) {
        const trainingPipelineIds = new Set<string>();
        for (const row of runs.Results ?? []) {
          const agentId = ReadString(row['AgentID']);
          const payload = ParseJsonRecord(row['FinalPayload']);
          const buildResult = ParseJsonRecord(payload?.['BuildResult']);
          if (buildResult && typeof buildResult['pipelineId'] === 'string') {
            trainingPipelineIds.add(NormalizeUUID(buildResult['pipelineId']));
          }
          if (agentId && UUIDsEqual(agentId, PIPELINE_BUILDER_AGENT_ID)) {
            buildCount += 1;
          }
        }
        if (buildCount === 0 && trainingPipelineIds.size > 0) {
          buildCount = trainingPipelineIds.size;
        }
      }
    }

    const passed = buildCount === expectedCount;
    return {
      oracleType: this.type,
      passed,
      score: passed ? 1 : 0,
      message: `builds-started: observed=${buildCount}, expected=${expectedCount}`,
      details: { observedCount: buildCount, expectedCount, runTreeSize: runTreeIds.length },
    };
  }
}

/** Deterministic oracle checking that zero (or expectedCount) ML models were published by the repeat. */
class ModelsPublishedOracle implements IOracle {
  public readonly type = 'models-published';

  public async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
    const expectedCount = typeof config['expectedCount'] === 'number' ? config['expectedCount'] : 0;
    const provider = input.provider;
    const targetRun = input.targetEntity as { ID?: string } | undefined;
    const rootRunId = ReadString(targetRun?.ID);
    if (!provider || !rootRunId) {
      return { oracleType: this.type, passed: false, score: 0, message: 'Missing provider or agent run ID.' };
    }

    const runTreeIds = await ExpandRunTreeIds(provider, input.contextUser, [rootRunId], input.testRunId);
    const modelIds = new Set<string>();
    const payload = ParseJsonRecord(input.actualOutput);
    const bestModelId = ReadString(payload?.['BestModelID']);
    if (bestModelId) modelIds.add(NormalizeUUID(bestModelId));
    const buildResult = ParseJsonRecord(payload?.['BuildResult']);
    const builtModelId = ReadString(buildResult?.['modelId']);
    if (builtModelId) modelIds.add(NormalizeUUID(builtModelId));

    let publishedCount = 0;
    if (buildResult?.['published'] === true) {
      publishedCount = 1;
    } else if (FindEntityInfo(provider.Entities, 'MJ: ML Models') && modelIds.size > 0) {
      const rv = RunView.FromMetadataProvider(provider);
      const models = await rv.RunView<Record<string, unknown>>(
        {
          EntityName: 'MJ: ML Models',
          ExtraFilter: `ID IN (${FormatSqlStringList(Array.from(modelIds))}) AND Status='Published'`,
          ResultType: 'simple',
          MaxRows: MAX_RUN_TREE_ROWS,
        },
        input.contextUser
      );
      if (models.Success) {
        publishedCount = (models.Results ?? []).length;
      }
    }

    const passed = publishedCount === expectedCount;
    return {
      oracleType: this.type,
      passed,
      score: passed ? 1 : 0,
      message: `models-published: observed=${publishedCount}, expected=${expectedCount}`,
      details: { observedCount: publishedCount, expectedCount, runTreeSize: runTreeIds.length },
    };
  }
}

/** Deterministic oracle checking that `mustExcludeFields` were excluded from selected modeling features. */
class ExcludedFieldsOracle implements IOracle {
  public readonly type = 'excluded-fields';

  public async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
    const rawRequired = config['mustExcludeFields'];
    const mustExclude = Array.isArray(rawRequired)
      ? rawRequired.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];

    if (mustExclude.length === 0) {
      return {
        oracleType: this.type,
        passed: true,
        score: 1,
        message: 'excluded-fields: no fields required to be excluded.',
      };
    }

    const payload = ParseJsonRecord(input.actualOutput) ?? {};
    const includedFeatures = new Set<string>();
    const rawCandidates = payload['CandidateFeatures'];
    if (Array.isArray(rawCandidates)) {
      for (const entry of rawCandidates) {
        const record = ParseJsonRecord(entry);
        const name = ReadString(record?.['Name'] ?? record?.['name']);
        const excluded = record?.['Excluded'] === true || record?.['excluded'] === true;
        if (name && !excluded) {
          includedFeatures.add(name.toLowerCase());
        }
      }
    }

    const leaked = mustExclude.filter((f) => includedFeatures.has(f.toLowerCase()));
    const passed = leaked.length === 0;
    return {
      oracleType: this.type,
      passed,
      score: passed ? 1 : 0,
      message: passed
        ? `excluded-fields: all ${mustExclude.length} forbidden fields excluded.`
        : `excluded-fields: forbidden fields present in plan features: ${leaked.join(', ')}`,
      details: { mustExcludeFields: mustExclude, leakedFields: leaked },
    };
  }
}

/**
 * Deterministic oracle checking `MJ: Agent Decision Log` for an expected refusal/decision entry.
 * When `MJ: Agent Decision Log` is absent from metadata (baseline DB, D5-34), treats it as 0 rows
 * and fails cleanly instead of throwing.
 */
class RefusalKindOracle implements IOracle {
  public readonly type = 'refusal-kind';

  public async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
    const expectedDecision = ReadString(config['expectedDecision']) ?? 'decline-no-signal';
    const provider = input.provider;
    if (!provider) {
      return { oracleType: this.type, passed: false, score: 0, message: 'No provider available for refusal-kind oracle.' };
    }

    if (!FindEntityInfo(provider.Entities, 'MJ: Agent Decision Log')) {
      return {
        oracleType: this.type,
        passed: false,
        score: 0,
        message: 'Entity MJ: Agent Decision Log is absent from provider metadata; read 0 rows.',
        details: { expectedDecision, rowCount: 0, entityPresent: false },
      };
    }

    const targetRun = input.targetEntity as { ID?: string } | undefined;
    const rootRunId = ReadString(targetRun?.ID);
    const runTreeIds = rootRunId
      ? await ExpandRunTreeIds(provider, input.contextUser, [rootRunId], input.testRunId)
      : [];
    if (runTreeIds.length === 0) {
      return { oracleType: this.type, passed: false, score: 0, message: 'No agent run tree IDs to query refusal log.' };
    }

    const rv = RunView.FromMetadataProvider(provider);
    const found = await rv.RunView<Record<string, unknown>>(
      {
        EntityName: 'MJ: Agent Decision Log',
        ExtraFilter: `AgentRunID IN (${FormatSqlStringList(runTreeIds)})`,
        ResultType: 'simple',
        MaxRows: MAX_RUN_TREE_ROWS,
      },
      input.contextUser
    );
    if (!found.Success) {
      return {
        oracleType: this.type,
        passed: false,
        score: 0,
        message: found.ErrorMessage || 'Failed to read MJ: Agent Decision Log.',
      };
    }

    const rows = found.Results ?? [];
    const matched = rows.some((row) => ReadString(row['Decision']) === expectedDecision);
    return {
      oracleType: this.type,
      passed: matched,
      score: matched ? 1 : 0,
      message: matched
        ? `refusal-kind: recorded '${expectedDecision}' decision log row.`
        : `refusal-kind: expected '${expectedDecision}' across ${rows.length} decision log row(s), none matched.`,
      details: { expectedDecision, rowCount: rows.length, entityPresent: true },
    };
  }
}

/** Deterministic oracle verifying zero leaked/archived notes entered the repeat's active context. */
class NotesLeakedOracle implements IOracle {
  public readonly type = 'notes-leaked';

  public async evaluate(input: OracleInput, config: OracleConfig): Promise<OracleResult> {
    const forbiddenIds = Array.isArray(config['forbiddenNoteIds'])
      ? config['forbiddenNoteIds'].filter((id): id is string => typeof id === 'string')
      : [];
    const provider = input.provider;
    if (!provider || !FindEntityInfo(provider.Entities, 'MJ: AI Agent Notes')) {
      return {
        oracleType: this.type,
        passed: true,
        score: 1,
        message: 'notes-leaked: 0 notes leaked.',
        details: { leakedNoteIds: [] },
      };
    }

    const rv = RunView.FromMetadataProvider(provider);
    const activeNotes = await rv.RunView<Record<string, unknown>>(
      {
        EntityName: 'MJ: AI Agent Notes',
        ExtraFilter: `Status <> 'Archived'`,
        ResultType: 'simple',
        MaxRows: MAX_NOTES_PER_RUN_TREE,
      },
      input.contextUser
    );
    if (!activeNotes.Success) {
      return {
        oracleType: this.type,
        passed: false,
        score: 0,
        message: activeNotes.ErrorMessage || 'Could not inspect MJ: AI Agent Notes.',
      };
    }

    const activeIds = new Set((activeNotes.Results ?? []).map((r) => NormalizeUUID(String(r['ID'] ?? ''))));
    const leaked = forbiddenIds.filter((id) => activeIds.has(NormalizeUUID(id)));
    const passed = leaked.length === 0;
    return {
      oracleType: this.type,
      passed,
      score: passed ? 1 : 0,
      message: passed
        ? 'notes-leaked: 0 notes leaked into active context.'
        : `notes-leaked: ${leaked.length} note(s) leaked into active context.`,
      details: { leakedNoteIds: leaked },
    };
  }
}

/**
 * Test driver for the Predictive Studio Agent Eval suite (§5.1.8, D5-33, D5-34).
 *
 * Guarantees:
 * - Refuses parallel runs (`workerIndex !== undefined`) with `parallel-refused` before starting any agent run.
 * - Isolates repeat memory by archiving PS-agent notes whose `SourceAIAgentRunID` belongs to that repeat's
 *   run tree before and after every repeat (never by time window, never touching another test's notes).
 * - Loads child-suite world context in `SetupSuite`.
 * - Supplies deterministic PS oracles (`builds-started`, `models-published`, `excluded-fields`,
 *   `refusal-kind`, `notes-leaked`) that work cleanly against both baseline and PR 5 schemas.
 */
@RegisterClass(BaseTestDriver, 'PredictiveStudioAgentEvalDriver')
export class PredictiveStudioAgentEvalDriver extends AgentEvalDriver {
  private static worldLoader: AgentEvalWorldLoader | undefined;

  /** Registers an optional host world loader invoked during `SetupSuite`. */
  public static RegisterWorldLoader(loader: AgentEvalWorldLoader | undefined): void {
    PredictiveStudioAgentEvalDriver.worldLoader = loader;
  }

  /**
   * Pin the suite rubric version and prepare the child suite's planted-truth world once per suite run.
   */
  public override async SetupSuite(context: SuiteFixtureContext, contextUser: UserInfo): Promise<void> {
    await super.SetupSuite(context, contextUser);

    const execution = {
      contextUser,
      fixtures: context,
      test: { ID: '' },
      testRun: { ID: context.SuiteRunID, TestSuiteRunID: context.SuiteRunID },
      options: {},
      oracleRegistry: new Map<string, IOracle>(),
    } as unknown as DriverExecutionContext;

    const loaded = await this.LoadSuites(execution);
    const suiteId = loaded.suiteId;
    if (!suiteId) {
      return;
    }

    const suiteRow = await this.ReadOne(execution, 'MJ: Test Suites', `ID='${EscapeSQLString(suiteId)}'`);
    const config = ParseJsonRecord(suiteRow?.['Configuration']);
    const worldId = ReadString(config?.['worldId']) as AgentEvalWorldId | undefined;
    const worldKind = ReadString(config?.['worldKind']) as 'corpus' | 'scenario' | 'world' | undefined;
    const seed = typeof config?.['seed'] === 'number' ? config['seed'] : undefined;

    if (worldId) {
      context.Data['world'] = { worldId, worldKind: worldKind ?? 'world', seed };
      if (PredictiveStudioAgentEvalDriver.worldLoader) {
        await PredictiveStudioAgentEvalDriver.worldLoader({
          WorldId: worldId,
          WorldKind: worldKind ?? 'world',
          Seed: seed,
          Context: context,
          ContextUser: contextUser,
        });
      }
    }
  }

  /**
   * Execute one repeat sequentially with pre/post run-tree note isolation and PS-specific deterministic oracles.
   */
  public override async Execute(context: DriverExecutionContext): Promise<DriverExecutionResult> {
    if (context.workerIndex !== undefined) {
      return {
        targetType: 'AI Agent',
        targetLogId: '',
        status: 'Failed',
        score: 0,
        oracleResults: [
          {
            oracleType: 'parallel-refused',
            passed: false,
            score: 0,
            message: 'parallel-refused: PredictiveStudioAgentEvalDriver refuses parallel runs so repeats never share concurrent notes state.',
          },
        ],
        passedChecks: 0,
        failedChecks: 1,
        totalChecks: 1,
        errorMessage: 'parallel-refused',
        failureClass: 'parallel-refused',
        failureMemo: 'Parallel execution refused (D5-33).',
      };
    }

    // Archive any stray notes left by earlier repeats of this test in the same suite run BEFORE running this repeat.
    await this.archivePriorRepeatsNotes(context);

    const enrichedContext: DriverExecutionContext = {
      ...context,
      oracleRegistry: this.buildEnrichedOracleRegistry(context.oracleRegistry),
    };

    let result: DriverExecutionResult | undefined;
    try {
      result = await super.Execute(enrichedContext);
      return result;
    } finally {
      const seedIds = [
        ...(result?.allAgentRunIds ?? []),
        ...(ReadString(result?.targetLogId) ? [ReadString(result?.targetLogId)!] : []),
      ];
      await this.archiveRunTreeNotes(context, seedIds);
    }
  }

  private buildEnrichedOracleRegistry(baseRegistry: Map<string, IOracle>): Map<string, IOracle> {
    const registry = new Map(baseRegistry);
    const builtIns: readonly IOracle[] = [
      new BuildsStartedOracle(),
      new ModelsPublishedOracle(),
      new ExcludedFieldsOracle(),
      new RefusalKindOracle(),
      new NotesLeakedOracle(),
    ];
    for (const oracle of builtIns) {
      if (!registry.has(oracle.type)) {
        registry.set(oracle.type, oracle);
      }
    }
    return registry;
  }

  private async archivePriorRepeatsNotes(context: DriverExecutionContext): Promise<void> {
    const provider = this.Provider;
    if (!provider || !FindEntityInfo(provider.Entities, 'MJ: Test Runs')) {
      return;
    }
    const rv = RunView.FromMetadataProvider(provider);
    const suiteRunId = ReadString(context.testRun.TestSuiteRunID);
    const filter = suiteRunId
      ? `TestID='${EscapeSQLString(context.test.ID)}' AND TestSuiteRunID='${EscapeSQLString(suiteRunId)}'`
      : `TestID='${EscapeSQLString(context.test.ID)}'`;

    const priorRuns = await rv.RunView<Record<string, unknown>>(
      {
        EntityName: 'MJ: Test Runs',
        ExtraFilter: filter,
        ResultType: 'simple',
        MaxRows: MAX_RUN_TREE_ROWS,
      },
      context.contextUser
    );
    if (!priorRuns.Success) {
      return;
    }

    const priorAgentSeeds: string[] = [];
    for (const row of priorRuns.Results ?? []) {
      const targetLogId = ReadString(row['TargetLogID']);
      if (targetLogId) priorAgentSeeds.push(targetLogId);
    }

    for (const row of priorRuns.Results ?? []) {
      const trId = ReadString(row['ID']);
      await this.archiveRunTreeNotesForSeeds(context, priorAgentSeeds, trId);
    }
    if ((priorRuns.Results ?? []).length === 0) {
      await this.archiveRunTreeNotes(context, []);
    }
  }

  private async archiveRunTreeNotes(context: DriverExecutionContext, seedRunIds: readonly string[]): Promise<void> {
    await this.archiveRunTreeNotesForSeeds(context, seedRunIds, ReadString(context.testRun.ID));
  }

  private async archiveRunTreeNotesForSeeds(
    context: DriverExecutionContext,
    seedRunIds: readonly string[],
    testRunId?: string
  ): Promise<void> {
    const provider = this.Provider;
    if (!provider || !FindEntityInfo(provider.Entities, 'MJ: AI Agent Notes')) {
      return;
    }

    const runTreeIds = await ExpandRunTreeIds(provider, context.contextUser, seedRunIds, testRunId);
    if (runTreeIds.length === 0) {
      return;
    }

    const rv = RunView.FromMetadataProvider(provider);
    const notesResult = await rv.RunView<Record<string, unknown>>(
      {
        EntityName: 'MJ: AI Agent Notes',
        ExtraFilter: `SourceAIAgentRunID IN (${FormatSqlStringList(runTreeIds)}) AND Status <> 'Archived'`,
        ResultType: 'simple',
        MaxRows: MAX_NOTES_PER_RUN_TREE,
      },
      context.contextUser
    );
    if (!notesResult.Success) {
      throw new Error(notesResult.ErrorMessage || 'Could not query MJ: AI Agent Notes for archival.');
    }

    for (const row of notesResult.Results ?? []) {
      const noteId = ReadString(row['ID']);
      if (!noteId) continue;
      const note = await provider.GetEntityObject<MJAIAgentNoteEntity>('MJ: AI Agent Notes', context.contextUser);
      if (!(await note.Load(noteId))) {
        continue;
      }
      if (note.Status !== 'Archived') {
        note.Status = 'Archived';
        if (!(await note.Save())) {
          throw new Error(
            note.LatestResult?.CompleteMessage || `Failed to archive MJ: AI Agent Notes ${noteId}`
          );
        }
      }
    }
  }
}
