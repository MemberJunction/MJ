import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import type { RubricDecisionRunner } from './LLMRubricEvaluator.js';
import type { EvaluationAgentRunner } from './AgentRubricEvaluator.js';
import { RunInEntityTransaction, RunView, type EntityTransactionScope } from '@memberjunction/core';
import { MJRubricBandEntity, MJRubricCriterionEntity, MJRubricCriterionLevelEntity, MJRubricEntity, MJRubricEvaluationEntity, MJRubricEvaluationScoreEntity, MJRubricVersionEntity } from '@memberjunction/core-entities';
import { EvidenceJson, HighestNonDraftVersion, type RubricNodeSnapshot, type ScoredNode } from '@memberjunction/rubrics-base';
import { RubricEngine, type RubricEvaluationStore, type RubricPromptRun, type RubricRecords } from './RubricEngine.js';

interface RubricProvider {
    SupportsEntityTransactions?: boolean;
    BeginEntityTransaction?(): Promise<EntityTransactionScope>;
    GetEntityObject(entityName: 'MJ: Rubrics', contextUser?: unknown): Promise<MJRubricEntity>;
    GetEntityObject(entityName: 'MJ: Rubric Versions', contextUser?: unknown): Promise<MJRubricVersionEntity>;
    GetEntityObject(entityName: 'MJ: Rubric Criteria', contextUser?: unknown): Promise<MJRubricCriterionEntity>;
    GetEntityObject(entityName: 'MJ: Rubric Criterion Levels', contextUser?: unknown): Promise<MJRubricCriterionLevelEntity>;
    GetEntityObject(entityName: 'MJ: Rubric Bands', contextUser?: unknown): Promise<MJRubricBandEntity>;
    GetEntityObject(entityName: 'MJ: Rubric Evaluations', contextUser?: unknown): Promise<MJRubricEvaluationEntity>;
    GetEntityObject(entityName: 'MJ: Rubric Evaluation Scores', contextUser?: unknown): Promise<MJRubricEvaluationScoreEntity>;
}

/**
 * Reads rubric rows through RunView and writes a Draft version through the
 * entity objects. Create sets Status to Draft and does not publish.
 */
export function ProviderRecords(provider: RubricProvider, user: unknown): RubricRecords {
    return {
        async rows(entityName, filter) {
            const view = RunView.FromMetadataProvider(provider as never);
            const result = await view.RunView({ EntityName: entityName, ExtraFilter: filter, ResultType: 'simple', MaxRows: 5000 }, user as never);
            if (!result.Success) throw new Error(result.ErrorMessage || `Could not read ${entityName}.`);
            return (result.Results ?? []) as Record<string, unknown>[];
        },
        createDraft(input) {
            return CreateDraftVersion(provider, user, input);
        },
    };
}

/**
 * Inserts a Draft version and its criteria. The status written is Draft.
 * BasedOnVersionID is the highest Published or Retired version of this rubric.
 * When the caller does not supply nodes, that version is cloned, including its
 * anchors and bands. Caller-supplied nodes are written as given, and anchors
 * and bands are still copied from the base where the keys match.
 *
 * Caller-supplied node ids are not primary keys. The entity assigns those.
 * A parent that is not in this draft is refused. The rubric, version, criteria,
 * anchors, and bands commit or roll back together.
 */
export async function CreateDraftVersion(provider: RubricProvider, user: unknown, input: { rubricId?: string; rubricName?: string; nodes: RubricNodeSnapshot[] }): Promise<{ id: string; status: string }> {
    assertParentsPresent(input.nodes);
    return RunInEntityTransaction(provider, async () => {
        const rubricId = input.rubricId?.trim() || await createRubric(provider, user, input.rubricName);
        const base = await findHighestVersion(provider, user, rubricId);
        const version = await provider.GetEntityObject('MJ: Rubric Versions', user);
        version.NewRecord();
        version.RubricID = rubricId;
        version.Status = 'Draft';
        if (base) version.BasedOnVersionID = base.id;
        if (!await version.Save()) throw new Error(version.LatestResult?.CompleteMessage || version.LatestResult?.Message || 'Could not create the draft version.');
        const versionId = String(version.ID ?? '');
        const nodes = input.nodes.length > 0 ? input.nodes : await clonedBaseNodes(provider, user, base?.id ?? null);
        assertParentsPresent(nodes);
        const storedIds = new Map<string, string>();
        for (const node of parentsFirst(nodes)) {
            const row = await provider.GetEntityObject('MJ: Rubric Criteria', user);
            row.NewRecord();
            row.RubricVersionID = versionId;
            if (node.parentId) {
                const parentId = storedIds.get(node.parentId);
                if (!parentId) throw new Error(`Criterion ${node.key} names a parent that is not in this draft.`);
                row.ParentID = parentId;
            }
            row.Key = node.key;
            row.Name = node.name;
            row.Description = node.description ?? null;
            row.Guidance = node.guidance ?? null;
            row.NodeType = node.nodeType;
            row.ScaleID = node.scaleId ?? null;
            row.Weight = node.weight;
            row.IsAdvisory = node.isAdvisory;
            row.IsGate = node.isGate;
            row.GateMinimumScore = node.gateMinimumScore ?? null;
            row.NotApplicablePolicy = node.notApplicablePolicy ?? null;
            row.RollupMethod = node.rollupMethod ?? null;
            row.EvidenceRequired = node.evidenceRequired;
            row.RationaleRequired = node.rationaleRequired;
            row.Sequence = node.sequence;
            row.EvaluatorConfig = node.evaluatorConfig === undefined || node.evaluatorConfig === null ? null : JSON.stringify(node.evaluatorConfig);
            if (!await row.Save()) throw new Error(row.LatestResult?.CompleteMessage || row.LatestResult?.Message || `Could not save criterion ${node.key}.`);
            const storedId = String(row.ID ?? '');
            if (!storedId) throw new Error(`Could not save criterion ${node.key}.`);
            if (storedId === node.id) throw new Error(`Create Rubric Draft does not reuse the id supplied for ${node.key}.`);
            storedIds.set(node.id, storedId);
        }
        const stored = nodes.map(node => ({
            ...node,
            id: storedIds.get(node.id) as string,
            parentId: node.parentId ? storedIds.get(node.parentId) ?? null : null,
        }));
        if (base) await copyAnchorsAndBands(provider, user, base.id, versionId, stored);
        return { id: versionId, status: String(version.Status ?? '') };
    });
}

async function createRubric(provider: RubricProvider, user: unknown, rubricName: string | undefined): Promise<string> {
    const name = rubricName?.trim();
    if (!name) throw new Error('A rubric id or name is required.');
    const rubric = await provider.GetEntityObject('MJ: Rubrics', user);
    rubric.NewRecord();
    rubric.Name = name;
    rubric.Status = 'Active';
    if (!await rubric.Save()) throw new Error(rubric.LatestResult?.CompleteMessage || rubric.LatestResult?.Message || 'Could not create the rubric.');
    const id = String(rubric.ID ?? '');
    if (!id) throw new Error('Could not create the rubric.');
    return id;
}

function assertParentsPresent(nodes: RubricNodeSnapshot[]): void {
    const ids = new Set(nodes.map(node => node.id));
    for (const node of nodes) {
        if (node.parentId && !ids.has(node.parentId)) {
            throw new Error(`Criterion ${node.key} names a parent that is not in this draft.`);
        }
    }
}

interface ListedRows {
    Success: boolean;
    Results?: Record<string, unknown>[];
    ErrorMessage?: string;
}

async function listRows(provider: RubricProvider, user: unknown, entityName: string, filter: string): Promise<Record<string, unknown>[]> {
    const direct = provider as RubricProvider & {
        RunView?: (params: { EntityName: string; ExtraFilter: string }, contextUser?: unknown) => Promise<ListedRows>;
    };
    const result = direct.RunView
        ? await direct.RunView({ EntityName: entityName, ExtraFilter: filter }, user)
        : await RunView.FromMetadataProvider(provider as never).RunView(
            { EntityName: entityName, ExtraFilter: filter, ResultType: 'simple', MaxRows: 5000 },
            user as never,
        );
    if (!result.Success) throw new Error(result.ErrorMessage || `Could not read ${entityName}.`);
    return (result.Results ?? []) as Record<string, unknown>[];
}

async function findHighestVersion(provider: RubricProvider, user: unknown, rubricId: string): Promise<{ id: string } | null> {
    const rows = await listRows(provider, user, 'MJ: Rubric Versions', `RubricID='${rubricId}' AND Status <> 'Draft'`);
    const best = HighestNonDraftVersion(rows.map(row => ({
        id: String(row.ID ?? ''),
        status: String(row.Status ?? ''),
        major: Number(row.MajorVersion ?? 0),
        minor: Number(row.MinorVersion ?? 0),
        patch: Number(row.PatchVersion ?? 0),
    })));
    return best ? { id: best.id } : null;
}

async function clonedBaseNodes(provider: RubricProvider, user: unknown, baseId: string | null): Promise<RubricNodeSnapshot[]> {
    if (!baseId) return [];
    const criteria = await listRows(provider, user, 'MJ: Rubric Criteria', `RubricVersionID='${baseId}'`);
    const ids = new Map(criteria.map(row => [String(row.ID ?? ''), crypto.randomUUID()]));
    return criteria.map(row => ({
        id: ids.get(String(row.ID ?? '')) as string,
        key: String(row.Key ?? ''),
        name: String(row.Name ?? ''),
        description: row.Description == null ? null : String(row.Description),
        guidance: row.Guidance == null ? null : String(row.Guidance),
        parentId: row.ParentID ? ids.get(String(row.ParentID)) ?? null : null,
        nodeType: (row.NodeType === 'Group' ? 'Group' : 'Criterion') as RubricNodeSnapshot['nodeType'],
        scaleId: row.ScaleID == null ? null : String(row.ScaleID),
        weight: Number(row.Weight ?? 1),
        isAdvisory: row.IsAdvisory === true || row.IsAdvisory === 1,
        isGate: row.IsGate === true || row.IsGate === 1,
        gateMinimumScore: row.GateMinimumScore == null ? null : Number(row.GateMinimumScore),
        notApplicablePolicy: row.NotApplicablePolicy == null ? null : row.NotApplicablePolicy as RubricNodeSnapshot['notApplicablePolicy'],
        rollupMethod: row.RollupMethod == null ? null : row.RollupMethod as RubricNodeSnapshot['rollupMethod'],
        evidenceRequired: row.EvidenceRequired === true || row.EvidenceRequired === 1,
        rationaleRequired: row.RationaleRequired === true || row.RationaleRequired === 1,
        sequence: Number(row.Sequence ?? 0),
        sourceCriterionId: String(row.ID ?? ''),
    })) as Array<RubricNodeSnapshot & { sourceCriterionId?: string }>;
}

async function copyAnchorsAndBands(
    provider: RubricProvider,
    user: unknown,
    baseId: string,
    versionId: string,
    nodes: Array<RubricNodeSnapshot & { sourceCriterionId?: string }>,
): Promise<void> {
    const baseCriteria = await listRows(provider, user, 'MJ: Rubric Criteria', `RubricVersionID='${baseId}'`);
    const byKey = new Map(baseCriteria.map(row => [String(row.Key ?? ''), String(row.ID ?? '')]));
    const baseIds = [...byKey.values()].filter(id => id.length > 0);
    const anchors = baseIds.length === 0
        ? []
        : await listRows(provider, user, 'MJ: Rubric Criterion Levels', `CriterionID IN (${baseIds.map(id => `'${id}'`).join(',')})`);
    for (const node of nodes) {
        const sourceId = node.sourceCriterionId ?? byKey.get(node.key);
        if (!sourceId) continue;
        for (const anchor of anchors.filter(row => String(row.CriterionID) === sourceId)) {
            const level = await provider.GetEntityObject('MJ: Rubric Criterion Levels', user);
            level.NewRecord();
            level.CriterionID = node.id;
            level.ScaleLevelID = anchor.ScaleLevelID == null ? null : String(anchor.ScaleLevelID);
            if (anchor.AnchorValue != null && anchor.AnchorValue !== '') level.AnchorValue = Number(anchor.AnchorValue);
            level.Descriptor = anchor.Descriptor == null ? '' : String(anchor.Descriptor);
            if (!await level.Save()) throw new Error(level.LatestResult?.CompleteMessage || level.LatestResult?.Message || `Could not copy an anchor for ${node.key}.`);
        }
    }
    const bands = await listRows(provider, user, 'MJ: Rubric Bands', `RubricVersionID='${baseId}'`);
    for (const band of bands) {
        const row = await provider.GetEntityObject('MJ: Rubric Bands', user);
        row.NewRecord();
        row.RubricVersionID = versionId;
        row.Label = band.Label == null ? '' : String(band.Label);
        row.MinScore = band.MinScore == null ? 0 : Number(band.MinScore);
        row.MaxScore = band.MaxScore == null ? 0 : Number(band.MaxScore);
        row.DisplayTone = (band.DisplayTone == null ? 'Neutral' : String(band.DisplayTone)) as MJRubricBandEntity['DisplayTone'];
        row.Sequence = band.Sequence == null ? 0 : Number(band.Sequence);
        if (band.Description !== undefined) row.Description = band.Description == null ? null : String(band.Description);
        if (!await row.Save()) throw new Error(row.LatestResult?.CompleteMessage || row.LatestResult?.Message || 'Could not copy a band.');
    }
}

function parentsFirst(nodes: RubricNodeSnapshot[]): RubricNodeSnapshot[] {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const ordered: RubricNodeSnapshot[] = [];
    const seen = new Set<string>();
    const visit = (node: RubricNodeSnapshot) => {
        if (seen.has(node.id)) return;
        if (node.parentId && byId.has(node.parentId)) visit(byId.get(node.parentId)!);
        seen.add(node.id);
        ordered.push(node);
    };
    for (const node of nodes) visit(node);
    return ordered;
}

/**
 * Evaluation store for a provider. Submit writes the leaf answers, then sets
 * Status to Submitted so the entity server scores the draft.
 */
export function ProviderEvaluationStore(provider: RubricProvider, user: unknown): RubricEvaluationStore {
    return {
        async createDraft(input) {
            const row = await provider.GetEntityObject('MJ: Rubric Evaluations', user);
            row.NewRecord();
            row.RubricVersionID = input.versionId;
            row.SubjectEntityID = input.subjectEntityId;
            row.SubjectRecordID = input.subjectRecordId;
            row.ContextEntityID = input.contextEntityId ?? null;
            row.ContextRecordID = input.contextRecordId ?? null;
            row.EvaluatorType = evaluatorType(input.evaluator);
            row.Status = 'Draft';
            if (input.passThreshold !== undefined && input.passThreshold !== null) row.PassThresholdApplied = input.passThreshold;
            if (input.aiAgentRunId) row.AIAgentRunID = input.aiAgentRunId;
            if (input.aiPromptRunId) row.AIPromptRunID = input.aiPromptRunId;
            if (input.evaluatorName) row.EvaluatorName = input.evaluatorName;
            if (input.metadata !== undefined) row.Metadata = typeof input.metadata === 'string' ? input.metadata : JSON.stringify(input.metadata);
            if (!await row.Save()) throw new Error(row.LatestResult?.CompleteMessage || row.LatestResult?.Message || 'Could not create the evaluation draft.');
            return { id: String(row.ID ?? ''), status: 'Draft' };
        },
        async submit(evaluationId, answers) {
            for (const answer of answers) {
                const score = await provider.GetEntityObject('MJ: Rubric Evaluation Scores', user);
                score.NewRecord();
                score.EvaluationID = evaluationId;
                score.CriterionID = answer.criterionId;
                score.ScaleLevelID = answer.scaleLevelId ?? null;
                score.RawValue = answer.rawValue ?? null;
                score.IsNotApplicable = answer.isNotApplicable === true;
                score.Confidence = answer.confidence ?? null;
                score.IsComputed = false;
                if (answer.rationale) score.Rationale = answer.rationale;
                if (answer.evidence !== undefined && answer.evidence !== null) {
                    score.Evidence = typeof answer.evidence === 'string' ? answer.evidence : JSON.stringify(answer.evidence);
                }
                if (!await score.Save()) throw new Error(score.LatestResult?.CompleteMessage || score.LatestResult?.Message || 'Could not save an answer.');
            }
            const evaluation = await provider.GetEntityObject('MJ: Rubric Evaluations', user);
            await evaluation.Load(evaluationId);
            evaluation.Status = 'Submitted';
            if (!await evaluation.Save()) throw new Error(evaluation.LatestResult?.CompleteMessage || evaluation.LatestResult?.Message || 'Could not submit the evaluation.');
            return {
                normalizedScore: numberOrNull(evaluation.NormalizedScore),
                completeness: numberOrNull(evaluation.Completeness),
                outcome: evaluation.Outcome as 'Passed',
                passed: evaluation.Passed === null || evaluation.Passed === undefined ? null : evaluation.Passed === true,
                gateFailed: evaluation.GateFailed === true,
                passThresholdApplied: numberOrNull(evaluation.PassThresholdApplied),
                bandId: evaluation.BandID == null ? null : String(evaluation.BandID),
                confidence: numberOrNull(evaluation.Confidence),
                scoredCriteriaCount: numberOrNull(evaluation.ScoredCriteriaCount) ?? 0,
                applicableCriteriaCount: numberOrNull(evaluation.ApplicableCriteriaCount) ?? 0,
                totalCriteriaCount: numberOrNull(evaluation.TotalCriteriaCount) ?? 0,
                nodes: await loadScoredNodes(provider, user, evaluationId),
                scoringEngineVersion: '1.0',
            };
        },
        async fail(evaluationId, errorMessage) {
            const evaluation = await provider.GetEntityObject('MJ: Rubric Evaluations', user);
            await evaluation.Load(evaluationId);
            evaluation.Status = 'Failed';
            evaluation.ErrorMessage = errorMessage;
            if (!await evaluation.Save()) throw new Error(evaluation.LatestResult?.CompleteMessage || evaluation.LatestResult?.Message || 'Could not record the failure.');
            return { id: evaluationId, status: 'Failed', errorMessage };
        },
    };
}

function evaluatorType(evaluator: string | undefined): MJRubricEvaluationEntity['EvaluatorType'] {
    if (evaluator === 'AI') return 'Agent';
    if (evaluator === 'Deterministic') return 'Deterministic';
    return 'AIPrompt';
}

/** Reads the score rows the entity server just wrote and returns them as scored nodes. */
async function loadScoredNodes(provider: RubricProvider, user: unknown, evaluationId: string): Promise<ScoredNode[]> {
    const view = RunView.FromMetadataProvider(provider as never);
    const scores = await view.RunView({
        EntityName: 'MJ: Rubric Evaluation Scores',
        ExtraFilter: `EvaluationID='${evaluationId.replace(/'/g, "''")}'`,
        ResultType: 'simple',
    }, user as never);
    if (!scores.Success) throw new Error(scores.ErrorMessage || 'Could not read the scored nodes.');
    const rows = (scores.Results ?? []) as Record<string, unknown>[];
    const ids = rows.map(row => String(row.CriterionID ?? '')).filter(id => id.length > 0);
    let criteriaResults: Record<string, unknown>[] = [];
    if (ids.length > 0) {
        const criteria = await view.RunView({
            EntityName: 'MJ: Rubric Criteria',
            ExtraFilter: `ID IN (${ids.map(id => `'${id.replace(/'/g, "''")}'`).join(',')})`,
            ResultType: 'simple',
        }, user as never);
        if (!criteria.Success) throw new Error(criteria.ErrorMessage || 'Could not read the scored criteria.');
        criteriaResults = (criteria.Results ?? []) as Record<string, unknown>[];
    }
    const byId = new Map(criteriaResults.map(row => [String(row.ID), row]));
    return rows.map(row => {
        const criterion = byId.get(String(row.CriterionID));
        return {
            id: String(row.CriterionID ?? ''),
            key: String(criterion?.Key ?? ''),
            normalizedScore: numberOrNull(row.NormalizedScore),
            effectiveWeight: numberOrNull(row.EffectiveWeight),
            overallContribution: numberOrNull(row.OverallContribution),
            completeness: numberOrNull(row.Completeness),
            confidence: numberOrNull(row.Confidence),
            gateFailed: row.GateFailed === true || row.GateFailed === 1,
            isNotApplicable: row.IsNotApplicable === true || row.IsNotApplicable === 1,
            isAdvisory: criterion?.IsAdvisory === true || criterion?.IsAdvisory === 1,
        };
    });
}

function numberOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Runs the already-rendered rubric text through the named prompt, so model
 * selection stays on that prompt. The action does not receive a runner.
 */
export function RubricEvaluatorPromptRun(provider: RubricProvider, user: unknown): RubricPromptRun {
    return {
        async Run(promptName, messages) {
            const view = RunView.FromMetadataProvider(provider as never);
            const found = await view.RunView({
                EntityName: 'MJ: AI Prompts',
                ExtraFilter: `Name='${promptName.replace(/'/g, "''")}'`,
                ResultType: 'entity_object',
                MaxRows: 1,
            }, user as never);
            const prompt = found.Results?.[0];
            if (!prompt) throw new Error(`The ${promptName} prompt was not found.`);
            const params = new AIPromptParams();
            params.prompt = prompt as AIPromptParams['prompt'];
            params.systemPromptOverride = messages.system;
            params.templateMessageRole = 'system';
            params.conversationMessages = [{ role: 'user', content: messages.user }];
            params.contextUser = user as AIPromptParams['contextUser'];
            const result = await new AIPromptRunner().ExecutePrompt(params);
            if (!result.success) throw new Error(result.errorMessage || `The ${promptName} prompt failed.`);
            if (typeof result.rawResult === 'string' && result.rawResult.length > 0) return result.rawResult;
            return JSON.stringify(result.result ?? {});
        },
    };
}

/** A RubricEngine whose catalog, evaluations, and Rubric Evaluator prompt use the caller's provider. */
/** PerCriterion asks AIDecisionRunner for a ScoreQuestion instead of sending the whole rubric. */
export function PromptDecisionRunner(provider: unknown, user: unknown): RubricDecisionRunner {
    return {
        async Score(key, question, state) {
            const view = RunView.FromMetadataProvider(provider as never);
            const found = await view.RunView({
                EntityName: 'MJ: AI Prompts',
                ExtraFilter: `Name='Rubric Evaluator'`,
                ResultType: 'entity_object',
                MaxRows: 1,
            }, user as never);
            const prompt = found.Results?.[0];
            if (!found.Success || !prompt) throw new Error('The Rubric Evaluator prompt was not found.');
            const { AIDecisionParams, AIDecisionRunner } = await import('@memberjunction/ai-prompts');
            const params = new AIDecisionParams();
            params.prompt = prompt as typeof params.prompt;
            params.State = state;
            params.Questions = { [key]: question };
            params.contextUser = user as typeof params.contextUser;
            const result = await new AIDecisionRunner().ExecuteDecision(params);
            if (!result.success) throw new Error(result.errorMessage || 'The score decision failed.');
            const answer = result.Answers[key];
            if (!answer || answer.Kind !== 'Score') throw new Error('The decision did not return a score.');
            return answer;
        },
    };
}

type AgentRunnerFactory = (provider: unknown, user: unknown) => EvaluationAgentRunner;

let agentRunnerFactory: AgentRunnerFactory | undefined;

/** Lets the agents package supply the runner without a package cycle. */
export function RegisterRubricAgentRunner(factory: AgentRunnerFactory): void {
    agentRunnerFactory = factory;
}

export function ProviderRubricEngine(provider: unknown, user: unknown): RubricEngine {
    const data = provider as RubricProvider;
    return new RubricEngine(
        ProviderEvaluationStore(data, user),
        ProviderRecords(data, user),
        RubricEvaluatorPromptRun(data, user),
        PromptDecisionRunner(data, user),
        agentRunnerFactory?.(data, user),
    );
}

export interface HumanScoreAnswer {
    CriterionId: string;
    ScaleLevelId?: string | null;
    RawValue?: number | null;
    IsNotApplicable?: boolean;
    Rationale?: string | null;
    Evidence?: unknown;
}

/**
 * Writes the human evaluation, its scores, and Submitted status in one transaction.
 * A failed score rolls the evaluation back. Evidence is stored as an evidence list.
 */
export async function SubmitHumanEvaluation(provider: RubricProvider, user: unknown, input: {
    rubricVersionId: string;
    subjectEntityId: string;
    subjectRecordId: string;
    contextEntityId?: string | null;
    contextRecordId?: string | null;
    evaluatorUserId: string;
    supersedesEvaluationId?: string | null;
    answers: HumanScoreAnswer[];
}): Promise<{ id: string; status: 'Submitted' }> {
    if (!input.rubricVersionId || !input.subjectEntityId || !input.subjectRecordId) throw new Error('A human score needs a version and a subject.');
    if (input.answers.length === 0) throw new Error('A human score needs at least one answer.');
    return RunInEntityTransaction(provider, async () => {
        const evaluation = await provider.GetEntityObject('MJ: Rubric Evaluations', user);
        evaluation.NewRecord();
        evaluation.RubricVersionID = input.rubricVersionId;
        evaluation.SubjectEntityID = input.subjectEntityId;
        evaluation.SubjectRecordID = input.subjectRecordId;
        evaluation.ContextEntityID = input.contextEntityId ?? null;
        evaluation.ContextRecordID = input.contextRecordId ?? null;
        evaluation.EvaluatorType = 'Human';
        evaluation.EvaluatorUserID = input.evaluatorUserId;
        evaluation.Status = 'Draft';
        evaluation.SupersedesEvaluationID = input.supersedesEvaluationId ?? null;
        if (!await evaluation.Save()) throw new Error(evaluation.LatestResult?.CompleteMessage || evaluation.LatestResult?.Message || 'Could not start the human score.');
        const evaluationId = String(evaluation.ID ?? '');
        if (!evaluationId) throw new Error('Could not start the human score.');
        for (const answer of input.answers) {
            const score = await provider.GetEntityObject('MJ: Rubric Evaluation Scores', user);
            score.NewRecord();
            score.EvaluationID = evaluationId;
            score.CriterionID = answer.CriterionId;
            score.ScaleLevelID = answer.IsNotApplicable ? null : answer.ScaleLevelId ?? null;
            score.RawValue = answer.IsNotApplicable ? null : answer.RawValue ?? null;
            score.IsNotApplicable = answer.IsNotApplicable === true;
            score.Rationale = answer.Rationale ?? null;
            score.Evidence = EvidenceJson(answer.Evidence);
            if (!await score.Save()) throw new Error(score.LatestResult?.CompleteMessage || score.LatestResult?.Message || 'Could not save a criterion answer.');
        }
        evaluation.Status = 'Submitted';
        if (!await evaluation.Save()) throw new Error(evaluation.LatestResult?.CompleteMessage || evaluation.LatestResult?.Message || 'Could not submit the human score.');
        return { id: evaluationId, status: 'Submitted' };
    });
}
