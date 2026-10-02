import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { RunView } from '@memberjunction/core';
import { HighestNonDraftVersion, type RubricNodeSnapshot, type ScoredNode } from '@memberjunction/rubrics-base';
import { RubricEngine, type RubricEvaluationStore, type RubricPromptRun, type RubricRecords } from './RubricEngine.js';

interface RubricRow {
    NewRecord?: () => void;
    Load?: (id: string) => Promise<boolean>;
    Set: (field: string, value: unknown) => void;
    Get: (field: string) => unknown;
    Save: () => Promise<boolean>;
    LatestResult?: { Message?: string };
}

interface RubricProvider {
    GetEntityObject(entityName: string, contextUser?: unknown): Promise<RubricRow>;
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

/** @deprecated Use {@link ProviderRecords}. */
export function providerRecords(provider: RubricProvider, user: unknown): RubricRecords {
    return ProviderRecords(provider, user);
}

/**
 * Inserts a Draft version and its criteria. The status written is Draft.
 * BasedOnVersionID is the highest Published or Retired version of this rubric.
 * When the caller does not supply nodes, that version is cloned, including its
 * anchors and bands. Caller-supplied nodes are written as given, and anchors
 * and bands are still copied from the base where the keys match.
 */
export async function CreateDraftVersion(provider: RubricProvider, user: unknown, input: { rubricId: string; nodes: RubricNodeSnapshot[] }): Promise<{ id: string; status: string }> {
    const base = await findHighestVersion(provider, user, input.rubricId);
    const version = await provider.GetEntityObject('MJ: Rubric Versions', user);
    version.NewRecord?.();
    version.Set('RubricID', input.rubricId);
    version.Set('Status', 'Draft');
    if (base) version.Set('BasedOnVersionID', base.id);
    if (!await version.Save()) throw new Error(version.LatestResult?.Message || 'Could not create the draft version.');
    const versionId = String(version.Get('ID') ?? '');
    const nodes = input.nodes.length > 0 ? input.nodes : await clonedBaseNodes(provider, user, base?.id ?? null);
    for (const node of parentsFirst(nodes)) {
        const row = await provider.GetEntityObject('MJ: Rubric Criteria', user);
        row.NewRecord?.();
        row.Set('ID', node.id);
        row.Set('RubricVersionID', versionId);
        if (node.parentId) row.Set('ParentID', node.parentId);
        row.Set('Key', node.key);
        row.Set('Name', node.name);
        row.Set('Description', node.description ?? null);
        row.Set('Guidance', node.guidance ?? null);
        row.Set('NodeType', node.nodeType);
        row.Set('ScaleID', node.scaleId ?? null);
        row.Set('Weight', node.weight);
        row.Set('IsAdvisory', node.isAdvisory);
        row.Set('IsGate', node.isGate);
        row.Set('GateMinimumScore', node.gateMinimumScore ?? null);
        row.Set('NotApplicablePolicy', node.notApplicablePolicy ?? null);
        row.Set('RollupMethod', node.rollupMethod ?? null);
        row.Set('EvidenceRequired', node.evidenceRequired);
        row.Set('RationaleRequired', node.rationaleRequired);
        row.Set('Sequence', node.sequence);
        row.Set('EvaluatorConfig', node.evaluatorConfig === undefined ? null : JSON.stringify(node.evaluatorConfig));
        if (!await row.Save()) throw new Error(row.LatestResult?.Message || `Could not save criterion ${node.key}.`);
    }
    if (base) await copyAnchorsAndBands(provider, user, base.id, versionId, nodes);
    return { id: versionId, status: String(version.Get('Status') ?? '') };
}

/** @deprecated Use {@link CreateDraftVersion}. */
export async function createDraftVersion(provider: RubricProvider, user: unknown, input: { rubricId: string; nodes: RubricNodeSnapshot[] }): Promise<{ id: string; status: string }> {
    return CreateDraftVersion(provider, user, input);
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
            level.NewRecord?.();
            level.Set('CriterionID', node.id);
            level.Set('ScaleLevelID', anchor.ScaleLevelID ?? null);
            level.Set('Descriptor', anchor.Descriptor ?? null);
            if (anchor.Sequence !== undefined) level.Set('Sequence', anchor.Sequence);
            if (!await level.Save()) throw new Error(level.LatestResult?.Message || `Could not copy an anchor for ${node.key}.`);
        }
    }
    const bands = await listRows(provider, user, 'MJ: Rubric Bands', `RubricVersionID='${baseId}'`);
    for (const band of bands) {
        const row = await provider.GetEntityObject('MJ: Rubric Bands', user);
        row.NewRecord?.();
        row.Set('RubricVersionID', versionId);
        row.Set('Label', band.Label ?? null);
        row.Set('MinScore', band.MinScore ?? null);
        row.Set('MaxScore', band.MaxScore ?? null);
        row.Set('DisplayTone', band.DisplayTone ?? null);
        row.Set('Sequence', band.Sequence ?? 0);
        if (band.Description !== undefined) row.Set('Description', band.Description);
        if (!await row.Save()) throw new Error(row.LatestResult?.Message || 'Could not copy a band.');
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
            row.NewRecord?.();
            row.Set('RubricVersionID', input.versionId);
            row.Set('SubjectEntityID', input.subjectEntityId);
            row.Set('SubjectRecordID', input.subjectRecordId);
            row.Set('ContextEntityID', input.contextEntityId ?? null);
            row.Set('ContextRecordID', input.contextRecordId ?? null);
            row.Set('EvaluatorType', evaluatorType(input.evaluator));
            row.Set('Status', 'Draft');
            if (input.passThreshold !== undefined && input.passThreshold !== null) row.Set('PassThresholdApplied', input.passThreshold);
            if (input.aiAgentRunId) row.Set('AIAgentRunID', input.aiAgentRunId);
            if (input.aiPromptRunId) row.Set('AIPromptRunID', input.aiPromptRunId);
            if (input.evaluatorName) row.Set('EvaluatorName', input.evaluatorName);
            if (input.metadata !== undefined) row.Set('Metadata', typeof input.metadata === 'string' ? input.metadata : JSON.stringify(input.metadata));
            if (!await row.Save()) throw new Error(row.LatestResult?.Message || 'Could not create the evaluation draft.');
            return { id: String(row.Get('ID') ?? ''), status: 'Draft' };
        },
        async submit(evaluationId, answers) {
            for (const answer of answers) {
                const score = await provider.GetEntityObject('MJ: Rubric Evaluation Scores', user);
                score.NewRecord?.();
                score.Set('EvaluationID', evaluationId);
                score.Set('CriterionID', answer.criterionId);
                score.Set('ScaleLevelID', answer.scaleLevelId ?? null);
                score.Set('RawValue', answer.rawValue ?? null);
                score.Set('IsNotApplicable', answer.isNotApplicable === true);
                score.Set('Confidence', answer.confidence ?? null);
                score.Set('IsComputed', false);
                if (answer.rationale) score.Set('Rationale', answer.rationale);
                if (answer.evidence !== undefined && answer.evidence !== null) {
                    score.Set('Evidence', typeof answer.evidence === 'string' ? answer.evidence : JSON.stringify(answer.evidence));
                }
                if (!await score.Save()) throw new Error(score.LatestResult?.Message || 'Could not save an answer.');
            }
            const evaluation = await provider.GetEntityObject('MJ: Rubric Evaluations', user);
            if (evaluation.Load) await evaluation.Load(evaluationId);
            evaluation.Set('Status', 'Submitted');
            if (!await evaluation.Save()) throw new Error(evaluation.LatestResult?.Message || 'Could not submit the evaluation.');
            return {
                normalizedScore: numberOrNull(evaluation.Get('NormalizedScore')),
                completeness: numberOrNull(evaluation.Get('Completeness')),
                outcome: evaluation.Get('Outcome') as 'Passed',
                passed: evaluation.Get('Passed') === null || evaluation.Get('Passed') === undefined ? null : evaluation.Get('Passed') === true,
                gateFailed: evaluation.Get('GateFailed') === true,
                passThresholdApplied: numberOrNull(evaluation.Get('PassThresholdApplied')),
                bandId: evaluation.Get('BandID') == null ? null : String(evaluation.Get('BandID')),
                confidence: numberOrNull(evaluation.Get('Confidence')),
                nodes: await loadScoredNodes(provider, user, evaluationId),
                scoringEngineVersion: '1.0',
            };
        },
        async fail(evaluationId, errorMessage) {
            const evaluation = await provider.GetEntityObject('MJ: Rubric Evaluations', user);
            if (evaluation.Load) await evaluation.Load(evaluationId);
            evaluation.Set('Status', 'Failed');
            evaluation.Set('ErrorMessage', errorMessage);
            if (!await evaluation.Save()) throw new Error(evaluation.LatestResult?.Message || 'Could not record the failure.');
            return { id: evaluationId, status: 'Failed', errorMessage };
        },
    };
}

/** @deprecated Use {@link ProviderEvaluationStore}. */
export function providerEvaluationStore(provider: RubricProvider, user: unknown): RubricEvaluationStore {
    return ProviderEvaluationStore(provider, user);
}

function evaluatorType(evaluator: string | undefined): string {
    if (evaluator === 'AI') return 'Agent';
    if (evaluator === 'LLM') return 'AIPrompt';
    return 'Deterministic';
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

/** @deprecated Use {@link RubricEvaluatorPromptRun}. */
export function rubricEvaluatorPromptRun(provider: RubricProvider, user: unknown): RubricPromptRun {
    return RubricEvaluatorPromptRun(provider, user);
}

/** A RubricEngine whose catalog, evaluations, and Rubric Evaluator prompt use the caller's provider. */
export function ProviderRubricEngine(provider: unknown, user: unknown): RubricEngine {
    const data = provider as RubricProvider;
    return new RubricEngine(ProviderEvaluationStore(data, user), ProviderRecords(data, user), RubricEvaluatorPromptRun(data, user));
}

/** @deprecated Use {@link ProviderRubricEngine}. */
export function providerRubricEngine(provider: unknown, user: unknown): RubricEngine {
    return ProviderRubricEngine(provider, user);
}
