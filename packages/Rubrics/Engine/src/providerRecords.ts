import { AIPromptParams } from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '@memberjunction/ai-prompts';
import { RunView } from '@memberjunction/core';
import type { RubricNodeSnapshot, ScoredNode } from '@memberjunction/rubrics-base';
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

/** Inserts a Draft version and its criteria. The status written is Draft. */
export async function CreateDraftVersion(provider: RubricProvider, user: unknown, input: { rubricId: string; nodes: RubricNodeSnapshot[] }): Promise<{ id: string; status: string }> {
    const version = await provider.GetEntityObject('MJ: Rubric Versions', user);
    version.NewRecord?.();
    version.Set('RubricID', input.rubricId);
    version.Set('Status', 'Draft');
    if (!await version.Save()) throw new Error(version.LatestResult?.Message || 'Could not create the draft version.');
    const versionId = String(version.Get('ID') ?? '');
    for (const node of parentsFirst(input.nodes)) {
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
    return { id: versionId, status: String(version.Get('Status') ?? '') };
}

/** @deprecated Use {@link CreateDraftVersion}. */
export async function createDraftVersion(provider: RubricProvider, user: unknown, input: { rubricId: string; nodes: RubricNodeSnapshot[] }): Promise<{ id: string; status: string }> {
    return CreateDraftVersion(provider, user, input);
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
        async Run(promptName, rendered) {
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
            params.systemPromptOverride = rendered;
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
