import { NodeSnapshotFromRecord, RubricScoring, RubricVersionDiff, type NotApplicablePolicy, type RubricBandSnapshot, type RubricNodeSnapshot, type RubricScaleSnapshot, type RubricScoreResult, type RubricVersionSnapshot, type VersionChange } from '@memberjunction/rubrics-base';

/** One answer on the scoring form. Groups are not answered. */
export interface RubricFormAnswer {
    criterionId: string;
    scaleLevelId?: string | null;
    isNotApplicable?: boolean;
    rationale?: string;
    evidence?: string;
}

/** Live weight share among a node's included siblings, as a percent. Advisory nodes are left out. */
export function WeightShares(nodes: RubricNodeSnapshot[]): Map<string, number> {
    const shares = new Map<string, number>();
    const groups = new Map<string, RubricNodeSnapshot[]>();
    for (const node of nodes) {
        const key = node.parentId ?? '';
        const list = groups.get(key) ?? [];
        list.push(node);
        groups.set(key, list);
    }
    for (const siblings of groups.values()) {
        const included = siblings.filter(node => !node.isAdvisory);
        const total = included.reduce((sum, node) => sum + node.weight, 0);
        for (const node of siblings) {
            if (node.isAdvisory || total <= 0) {
                shares.set(node.id, 0);
                continue;
            }
            shares.set(node.id, (node.weight / total) * 100);
        }
    }
    return shares;
}

/** @deprecated Use {@link WeightShares}. */
export function weightShares(nodes: RubricNodeSnapshot[]): Map<string, number> {
    return WeightShares(nodes);
}

/** Problems that block a draft from being a publishable tree. */
export function DraftProblems(nodes: RubricNodeSnapshot[], scales: RubricScaleSnapshot[]): string[] {
    const problems: string[] = [];
    const keys = new Set<string>();
    const ids = new Set(nodes.map(node => node.id));
    for (const node of nodes) {
        if (keys.has(node.key)) problems.push(`Duplicate key ${node.key}.`);
        keys.add(node.key);
        if (node.parentId && !ids.has(node.parentId)) problems.push(`${node.key} points at a missing parent.`);
        if (isAncestor(nodes, node.id, node.parentId ?? null)) problems.push(`${node.key} is inside its own descendant.`);
        if (node.nodeType === 'Criterion' && !node.scaleId) problems.push(`${node.key} needs a scale.`);
        if (node.scaleId && !scales.some(scale => scale.id === node.scaleId)) problems.push(`${node.key} names a missing scale.`);
        if (node.isGate && (node.gateMinimumScore === undefined || node.gateMinimumScore === null)) {
            problems.push(`${node.key} is a gate with no minimum.`);
        }
    }
    return problems;
}

/** @deprecated Use {@link DraftProblems}. */
export function draftProblems(nodes: RubricNodeSnapshot[], scales: RubricScaleSnapshot[]): string[] {
    return DraftProblems(nodes, scales);
}

/** A new group or leaf. The host saves the draft. The widget does not publish. */
export function AddNode(nodes: RubricNodeSnapshot[], name: string, nodeType: 'Group' | 'Criterion', scaleId: string | null, parentId: string | null = null): RubricNodeSnapshot[] {
    const key = uniqueKey(nodes, slug(name));
    const sequence = nodes.filter(node => (node.parentId ?? null) === parentId).length;
    return [...nodes, {
        id: crypto.randomUUID(),
        key,
        name,
        parentId,
        nodeType,
        scaleId: nodeType === 'Criterion' ? scaleId : null,
        weight: 1,
        isAdvisory: false,
        isGate: false,
        evidenceRequired: false,
        rationaleRequired: false,
        sequence,
    }];
}

/** @deprecated Use {@link AddNode}. */
export function addNode(nodes: RubricNodeSnapshot[], name: string, nodeType: 'Group' | 'Criterion', scaleId: string | null, parentId: string | null = null): RubricNodeSnapshot[] {
    return AddNode(nodes, name, nodeType, scaleId, parentId);
}

export function AddCriterion(nodes: RubricNodeSnapshot[], name: string, scaleId: string | null): RubricNodeSnapshot[] {
    return AddNode(nodes, name, 'Criterion', scaleId, null);
}

/** @deprecated Use {@link AddCriterion}. */
export function addCriterion(nodes: RubricNodeSnapshot[], name: string, scaleId: string | null): RubricNodeSnapshot[] {
    return AddCriterion(nodes, name, scaleId);
}

/**
 * Moving sets the parent and puts the node at the end of that parent's children.
 * A move under the node's own descendant leaves the tree unchanged.
 */
export function MoveNode(nodes: RubricNodeSnapshot[], id: string, parentId: string | null): RubricNodeSnapshot[] {
    if (parentId === id || isAncestor(nodes, id, parentId)) return nodes;
    const sequence = nodes.filter(node => node.id !== id && (node.parentId ?? null) === parentId).length;
    return nodes.map(node => node.id === id ? { ...node, parentId, sequence } : node);
}

/** @deprecated Use {@link MoveNode}. */
export function moveNode(nodes: RubricNodeSnapshot[], id: string, parentId: string | null): RubricNodeSnapshot[] {
    return MoveNode(nodes, id, parentId);
}

/** Names the key when the new parent is the node or one of its descendants. */
export function MoveProblem(nodes: RubricNodeSnapshot[], id: string, parentId: string | null): string | null {
    if (parentId !== id && !isAncestor(nodes, id, parentId)) return null;
    const node = nodes.find(item => item.id === id);
    return `${node?.key ?? id} cannot be moved under its own descendant.`;
}

/** @deprecated Use {@link MoveProblem}. */
export function moveProblem(nodes: RubricNodeSnapshot[], id: string, parentId: string | null): string | null {
    return MoveProblem(nodes, id, parentId);
}

export function SetWeight(nodes: RubricNodeSnapshot[], id: string, weight: number): RubricNodeSnapshot[] {
    return nodes.map(node => node.id === id ? { ...node, weight: weight < 0 ? 0 : weight } : node);
}

/** @deprecated Use {@link SetWeight}. */
export function setWeight(nodes: RubricNodeSnapshot[], id: string, weight: number): RubricNodeSnapshot[] {
    return SetWeight(nodes, id, weight);
}

export function SetScale(nodes: RubricNodeSnapshot[], id: string, scaleId: string | null): RubricNodeSnapshot[] {
    return nodes.map(node => node.id === id ? { ...node, scaleId } : node);
}

/** @deprecated Use {@link SetScale}. */
export function setScale(nodes: RubricNodeSnapshot[], id: string, scaleId: string | null): RubricNodeSnapshot[] {
    return SetScale(nodes, id, scaleId);
}

export function SetAnchor(nodes: RubricNodeSnapshot[], id: string, scaleLevelId: string, descriptor: string): RubricNodeSnapshot[] {
    return nodes.map(node => {
        if (node.id !== id) return node;
        const anchors = [...(node.anchors ?? []).filter(anchor => anchor.scaleLevelId !== scaleLevelId), { scaleLevelId, descriptor }];
        return { ...node, anchors };
    });
}

/** @deprecated Use {@link SetAnchor}. */
export function setAnchor(nodes: RubricNodeSnapshot[], id: string, scaleLevelId: string, descriptor: string): RubricNodeSnapshot[] {
    return SetAnchor(nodes, id, scaleLevelId, descriptor);
}

export function SetGate(nodes: RubricNodeSnapshot[], id: string, isGate: boolean, gateMinimumScore: number | null): RubricNodeSnapshot[] {
    return nodes.map(node => node.id === id ? { ...node, isGate, gateMinimumScore: isGate ? gateMinimumScore : null } : node);
}

/** @deprecated Use {@link SetGate}. */
export function setGate(nodes: RubricNodeSnapshot[], id: string, isGate: boolean, gateMinimumScore: number | null): RubricNodeSnapshot[] {
    return SetGate(nodes, id, isGate, gateMinimumScore);
}

export function SetPolicy(nodes: RubricNodeSnapshot[], id: string, notApplicablePolicy: NotApplicablePolicy | null): RubricNodeSnapshot[] {
    return nodes.map(node => node.id === id ? { ...node, notApplicablePolicy } : node);
}

export function PatchNode(nodes: RubricNodeSnapshot[], id: string, patch: Partial<RubricNodeSnapshot>): RubricNodeSnapshot[] {
    return nodes.map(node => node.id === id ? { ...node, ...patch } : node);
}

/** Drops the node and every node under it. */
export function RemoveNode(nodes: RubricNodeSnapshot[], id: string): RubricNodeSnapshot[] {
    const drop = new Set<string>();
    const visit = (nodeId: string): void => {
        drop.add(nodeId);
        for (const child of nodes) if ((child.parentId ?? null) === nodeId) visit(child.id);
    };
    visit(id);
    return nodes.filter(node => !drop.has(node.id));
}

export function RemoveBand(bands: RubricBandSnapshot[], id: string): RubricBandSnapshot[] {
    return bands.filter(band => band.id !== id);
}

/** @deprecated Use {@link SetPolicy}. */
export function setPolicy(nodes: RubricNodeSnapshot[], id: string, notApplicablePolicy: NotApplicablePolicy | null): RubricNodeSnapshot[] {
    return SetPolicy(nodes, id, notApplicablePolicy);
}

export function AddBand(bands: RubricBandSnapshot[], label: string): RubricBandSnapshot[] {
    return [...bands, { id: crypto.randomUUID(), label, minScore: 0, maxScore: 1, displayTone: 'Neutral', sequence: bands.length }];
}

/** @deprecated Use {@link AddBand}. */
export function addBand(bands: RubricBandSnapshot[], label: string): RubricBandSnapshot[] {
    return AddBand(bands, label);
}

export function UpdateBand(bands: RubricBandSnapshot[], id: string, patch: Partial<Pick<RubricBandSnapshot, 'label' | 'minScore' | 'maxScore' | 'displayTone' | 'sequence' | 'description'>>): RubricBandSnapshot[] {
    return bands.map(band => band.id === id ? { ...band, ...patch } : band);
}

/** @deprecated Use {@link UpdateBand}. */
export function updateBand(bands: RubricBandSnapshot[], id: string, patch: Partial<Pick<RubricBandSnapshot, 'label' | 'minScore' | 'maxScore'>>): RubricBandSnapshot[] {
    return UpdateBand(bands, id, patch);
}

/** Anchor text shown beside one scale level. */
export function AnchorsForLevel(node: RubricNodeSnapshot, levelId: string): { descriptor: string }[] {
    return (node.anchors ?? []).filter(anchor => anchor.scaleLevelId === levelId && (anchor.descriptor ?? '').trim().length > 0);
}

/** @deprecated Use {@link AnchorsForLevel}. */
export function anchorsForLevel(node: RubricNodeSnapshot, levelId: string): { descriptor: string }[] {
    return AnchorsForLevel(node, levelId);
}

export function EffectivePolicy(node: RubricNodeSnapshot, versionPolicy: NotApplicablePolicy): NotApplicablePolicy {
    return node.notApplicablePolicy ?? versionPolicy;
}

/** @deprecated Use {@link EffectivePolicy}. */
export function effectivePolicy(node: RubricNodeSnapshot, versionPolicy: NotApplicablePolicy): NotApplicablePolicy {
    return EffectivePolicy(node, versionPolicy);
}

/**
 * Names the leaves that still need an answer, a required rationale, or required evidence.
 * An unanswered advisory leaf does not block submit. NotAllowed refuses a not-applicable answer.
 */
export function IncompleteAnswers(nodes: RubricNodeSnapshot[], answers: RubricFormAnswer[], versionPolicy: NotApplicablePolicy = 'ExcludeAndRedistribute'): string[] {
    const missing: string[] = [];
    for (const node of nodes.filter(item => item.nodeType === 'Criterion')) {
        const answer = answers.find(item => item.criterionId === node.id);
        const policy = EffectivePolicy(node, versionPolicy);
        if (node.isAdvisory && !answer?.scaleLevelId && !answer?.isNotApplicable) continue;
        if (!answer?.scaleLevelId && !answer?.isNotApplicable) {
            missing.push(`${node.name} is unanswered.`);
            continue;
        }
        if (answer?.isNotApplicable) {
            if (policy === 'NotAllowed') missing.push(`${node.name} cannot be not applicable.`);
            continue;
        }
        if (node.rationaleRequired && !(answer?.rationale ?? '').trim()) missing.push(`${node.name} requires a rationale.`);
        if (node.evidenceRequired && !(answer?.evidence ?? '').trim()) missing.push(`${node.name} requires evidence.`);
    }
    return missing;
}

/** @deprecated Use {@link IncompleteAnswers}. */
export function incompleteAnswers(nodes: RubricNodeSnapshot[], answers: RubricFormAnswer[], versionPolicy: NotApplicablePolicy = 'ExcludeAndRedistribute'): string[] {
    return IncompleteAnswers(nodes, answers, versionPolicy);
}

export function CanSubmit(nodes: RubricNodeSnapshot[], answers: RubricFormAnswer[], versionPolicy: NotApplicablePolicy = 'ExcludeAndRedistribute'): boolean {
    return IncompleteAnswers(nodes, answers, versionPolicy).length === 0;
}

/** @deprecated Use {@link CanSubmit}. */
export function canSubmit(nodes: RubricNodeSnapshot[], answers: RubricFormAnswer[], versionPolicy: NotApplicablePolicy = 'ExcludeAndRedistribute'): boolean {
    return CanSubmit(nodes, answers, versionPolicy);
}

/**
 * Selects a level, or clears it when the leaf is marked not applicable.
 * NotAllowed leaves the answers unchanged, so N does not clear the level.
 */
export function AnswerLevel(answers: RubricFormAnswer[], criterionId: string, scaleLevelId: string | null, notApplicable: boolean, policy: NotApplicablePolicy = 'ExcludeAndRedistribute'): RubricFormAnswer[] {
    if (notApplicable && policy === 'NotAllowed') return answers;
    const next = answers.filter(item => item.criterionId !== criterionId);
    const previous = answers.find(item => item.criterionId === criterionId);
    next.push({
        criterionId,
        scaleLevelId: notApplicable ? null : scaleLevelId,
        isNotApplicable: notApplicable,
        rationale: previous?.rationale,
        evidence: previous?.evidence,
    });
    return next;
}

/** @deprecated Use {@link AnswerLevel}. */
export function answerLevel(answers: RubricFormAnswer[], criterionId: string, scaleLevelId: string | null, notApplicable: boolean, policy: NotApplicablePolicy = 'ExcludeAndRedistribute'): RubricFormAnswer[] {
    return AnswerLevel(answers, criterionId, scaleLevelId, notApplicable, policy);
}

/** Scores the sample answers with RubricScoring. The widget does not keep a second copy of the math. */
export function PreviewScore(version: RubricVersionSnapshot, answers: RubricFormAnswer[]): RubricScoreResult {
    return RubricScoring.compute({
        version,
        answers: answers.filter(item => item.scaleLevelId || item.isNotApplicable).map(item => ({
            criterionId: item.criterionId,
            scaleLevelId: item.scaleLevelId,
            isNotApplicable: item.isNotApplicable,
        })),
    });
}

/** @deprecated Use {@link PreviewScore}. */
export function previewScore(version: RubricVersionSnapshot, answers: RubricFormAnswer[]): RubricScoreResult {
    return PreviewScore(version, answers);
}

/** Maps a 0..1 score onto the version's display range. Null stays null. */
export function DisplayScore(normalized: number | null, min: number, max: number): number | null {
    if (normalized === null) return null;
    return min + normalized * (max - min);
}

/** @deprecated Use {@link DisplayScore}. */
export function displayScore(normalized: number | null, min: number, max: number): number | null {
    return DisplayScore(normalized, min, max);
}

/**
 * The same half-open rule as RubricScoring.bandId. A score equal to a band's max
 * belongs to the next band. The band whose max is 1 also contains 1.
 */
export function BandFor(normalized: number | null, bands: RubricBandSnapshot[]): RubricBandSnapshot | null {
    if (normalized === null) return null;
    const ordered = [...bands].sort((a, b) => a.minScore - b.minScore || a.maxScore - b.maxScore);
    for (const band of ordered) {
        const top = band.maxScore === 1 && normalized === 1;
        if (normalized >= band.minScore && (normalized < band.maxScore || top)) return band;
    }
    return null;
}

/** @deprecated Use {@link BandFor}. */
export function bandFor(normalized: number | null, bands: RubricBandSnapshot[]): RubricBandSnapshot | null {
    return BandFor(normalized, bands);
}

/** True when `ancestorId` sits on the parent chain of `nodeId`, including a cycle back to itself. */
function isAncestor(nodes: RubricNodeSnapshot[], ancestorId: string, nodeId: string | null): boolean {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const seen = new Set<string>();
    let current = nodeId;
    while (current) {
        if (current === ancestorId) return true;
        if (seen.has(current)) return false;
        seen.add(current);
        current = byId.get(current)?.parentId ?? null;
    }
    return false;
}

const BUMP_ORDER = ['Patch', 'Minor', 'Major'] as const;

export interface PublishPreview {
    computedBump: 'Major' | 'Minor' | 'Patch' | null;
    appliedBump: string | null;
    nextVersion: string | null;
    changes: VersionChange[];
    identical: boolean;
    /** Bumps the author may request. Lower than the computed bump is omitted. */
    higherBumps: ('Major' | 'Minor' | 'Patch')[];
}

/** The dialog shows this. Confirming is the host's job. The widget does not publish. */
export function PublishPreview(base: RubricVersionSnapshot | null, draft: RubricVersionSnapshot, requested?: 'Major' | 'Minor' | 'Patch' | null): PublishPreview {
    const diff = RubricVersionDiff.diff(base, draft, requested);
    const computed = diff.computedBump;
    return {
        computedBump: computed,
        appliedBump: diff.appliedBump,
        nextVersion: diff.nextVersion ? `${diff.nextVersion.major}.${diff.nextVersion.minor}.${diff.nextVersion.patch}` : null,
        changes: diff.changes,
        identical: diff.appliedBump === null,
        higherBumps: computed ? BUMP_ORDER.filter(item => BUMP_ORDER.indexOf(item) > BUMP_ORDER.indexOf(computed)) : [],
    };
}

/** @deprecated Use {@link PublishPreview}. */
/** Keyboard shortcuts apply to the criterion card, not to the rationale or level controls. */
export function ScoringShortcutApplies(tagName: string | undefined): boolean {
    const tag = tagName?.toLowerCase();
    return tag !== 'input' && tag !== 'textarea' && tag !== 'select';
}

/** A requested bump is sent only when the author picked one. Initial is computed, not requested. */
export function ChosenPublishBump(requested: string | null | undefined): 'Major' | 'Minor' | 'Patch' | null {
    return requested === 'Major' || requested === 'Minor' || requested === 'Patch' ? requested : null;
}

export function publishPreview(base: RubricVersionSnapshot | null, draft: RubricVersionSnapshot, requested?: 'Major' | 'Minor' | 'Patch' | null): PublishPreview {
    return PublishPreview(base, draft, requested);
}

export interface DiffRow {
    key: string;
    left: string | null;
    right: string | null;
    marks: VersionChange[];
}

/** Criterion keys, plus one row for each change that is not a criterion (version, band, or scale). */
/** True when every sample answer points at a criterion that is on screen. */
export function SampleMatchesTree(nodes: { id: string; nodeType: string }[], answers: { criterionId: string }[]): boolean {
    const ids = new Set(nodes.filter(node => node.nodeType === 'Criterion').map(node => node.id));
    return answers.length > 0 && answers.length === ids.size && answers.every(answer => ids.has(answer.criterionId));
}

/** @deprecated Use {@link SampleMatchesTree}. */
export function sampleMatchesTree(nodes: { id: string; nodeType: string }[], answers: { criterionId: string }[]): boolean {
    return SampleMatchesTree(nodes, answers);
}

export function VersionRows(base: RubricVersionSnapshot, draft: RubricVersionSnapshot): DiffRow[] {
    const diff = RubricVersionDiff.diff(base, draft);
    const keys = [...new Set([...base.nodes.map(node => node.key), ...draft.nodes.map(node => node.key)])];
    const rows: DiffRow[] = keys.map(key => ({
        key,
        left: base.nodes.find(node => node.key === key)?.name ?? null,
        right: draft.nodes.find(node => node.key === key)?.name ?? null,
        marks: diff.changes.filter(change => change.subject === key),
    }));
    const extras = new Map<string, VersionChange[]>();
    for (const change of diff.changes) {
        if (keys.includes(change.subject)) continue;
        const list = extras.get(change.subject) ?? [];
        list.push(change);
        extras.set(change.subject, list);
    }
    for (const [subject, changes] of extras) {
        rows.push({
            key: subject,
            left: sideText(base, subject),
            right: sideText(draft, subject),
            marks: changes,
        });
    }
    return rows;
}

/** @deprecated Use {@link VersionRows}. */
export function versionRows(base: RubricVersionSnapshot, draft: RubricVersionSnapshot): DiffRow[] {
    return VersionRows(base, draft);
}



function sideText(version: RubricVersionSnapshot, subject: string): string | null {
    if (subject === 'version') return version.instructions ?? null;
    const band = version.bands.find(item => item.label === subject || item.id === subject);
    if (band) return `${band.minScore}–${band.maxScore}`;
    const scale = version.scales.find(item => item.id === subject);
    return scale ? scale.scaleType : null;
}

export interface MatrixColumn {
    id: string;
    name: string;
    evaluatorType: 'Human' | 'AI' | 'AIPrompt' | 'Agent' | 'Self' | 'Deterministic' | 'External';
    status: string;
    scores: { key: string; normalizedScore: number | null; rationale?: string }[];
}

export interface MatrixModel {
    rows: { key: string; cells: { columnId: string; score: number | null; disagree: boolean }[] }[];
    humanMean: number | null;
    aiMean: number | null;
    selfScore: number | null;
}

/** Evaluators across, criteria down. A cell disagrees when the other included scores on that row differ. Withdrawn columns stay visible and out of the means. */
export function ComparisonMatrix(keys: string[], columns: MatrixColumn[]): MatrixModel {
    const included = columns.filter(column => column.status !== 'Withdrawn' && column.evaluatorType !== 'Self');
    const rows = keys.map(key => {
        const values = included.map(column => column.scores.find(score => score.key === key)?.normalizedScore ?? null).filter((score): score is number => score !== null);
        const disagree = new Set(values).size > 1;
        return {
            key,
            cells: columns.map(column => ({
                columnId: column.id,
                score: column.scores.find(score => score.key === key)?.normalizedScore ?? null,
                disagree: disagree && column.status !== 'Withdrawn' && column.evaluatorType !== 'Self',
            })),
        };
    });
    return {
        rows,
        humanMean: meanOf(columns.filter(column => column.evaluatorType === 'Human' && column.status !== 'Withdrawn')),
        aiMean: meanOf(columns.filter(column => IsAiEvaluator(column.evaluatorType) && column.status !== 'Withdrawn')),
        selfScore: meanOf(columns.filter(column => column.evaluatorType === 'Self' && column.status !== 'Withdrawn')),
    };
}

/** Stored evaluator types. `AIPrompt` and `Agent` are the AI columns. `AI` is not a stored type. */
export function IsAiEvaluator(type: string): boolean {
    return type === 'AIPrompt' || type === 'Agent' || type === 'AI';
}

/** The version to show when the rubric has no draft. A published version wins over a retired one. */
export function VersionShownWithoutDraft<T extends { Status?: unknown; MajorVersion?: unknown; MinorVersion?: unknown; PatchVersion?: unknown }>(rows: T[]): T | null {
    const published = rows.filter(row => row.Status === 'Published');
    const pool = published.length > 0 ? published : rows.filter(row => row.Status === 'Retired');
    return [...pool].sort((left, right) =>
        Number(right.MajorVersion ?? 0) - Number(left.MajorVersion ?? 0)
        || Number(right.MinorVersion ?? 0) - Number(left.MinorVersion ?? 0)
        || Number(right.PatchVersion ?? 0) - Number(left.PatchVersion ?? 0))[0] ?? null;
}

/** Submitted evaluations for one subject, one rubric, and one major. */
export function ComparisonCohortFilter(rubricId: string, major: number, subjectEntityId: string): string {
    const quote = (value: string) => value.replace(/'/g, "''");
    return `RubricID='${quote(rubricId)}' AND RubricMajorVersion=${Number(major)} AND SubjectEntityID='${quote(subjectEntityId)}' AND Status='Submitted'`;
}

/** One column per evaluation. Scores join on the evaluation id. */
export function MatrixColumnsFromRows(evaluations: Record<string, unknown>[], scores: Record<string, unknown>[]): MatrixColumn[] {
    return evaluations.map(row => {
        const id = String(row.ID ?? '');
        const evaluatorType = String(row.EvaluatorType ?? 'Human') as MatrixColumn['evaluatorType'];
        return {
            id,
            name: MatrixColumnName(row),
            evaluatorType,
            status: String(row.Status ?? 'Submitted'),
            scores: scores.filter(score => String(score.EvaluationID ?? '') === id && score.IsComputed !== true && score.IsComputed !== 1).map(score => ({
                key: String(score.CriterionKey ?? score.Criterion ?? ''),
                normalizedScore: score.NormalizedScore == null ? null : Number(score.NormalizedScore),
                rationale: score.Rationale == null ? undefined : String(score.Rationale),
            })),
        };
    });
}

function MatrixColumnName(row: Record<string, unknown>): string {
    const type = String(row.EvaluatorType ?? '');
    if (type === 'Human') return String(row.EvaluatorUser ?? 'Human');
    if (type === 'AIPrompt') return 'AI Prompt';
    if (type === 'Agent') return 'Agent';
    if (type === 'Self') return 'Agent Self-Check';
    return type || 'Evaluation';
}

/** @deprecated Use {@link ComparisonMatrix}. */
export function comparisonMatrix(keys: string[], columns: MatrixColumn[]): MatrixModel {
    return ComparisonMatrix(keys, columns);
}

function meanOf(columns: MatrixColumn[]): number | null {
    const scores = columns.flatMap(column => column.scores.map(score => score.normalizedScore)).filter((score): score is number => score !== null);
    if (scores.length === 0) return null;
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

/** A criterion row from MJ: Rubric Criteria, as the author widget expects it. */
export function NodeFromRow(row: Record<string, unknown>, anchors: RubricNodeSnapshot['anchors'] = []): RubricNodeSnapshot {
    return { ...NodeSnapshotFromRecord(row), anchors };
}

/** @deprecated Use {@link NodeFromRow}. */
export function nodeFromRow(row: Record<string, unknown>, anchors: RubricNodeSnapshot['anchors'] = []): RubricNodeSnapshot {
    return NodeFromRow(row, anchors);
}

/** Writes include the client id, so a new row is stored under the id the form already holds. Removed ids are deleted children first. */
export function PlanNodeSave(existing: { id: string; parentId: string | null }[], nodes: RubricNodeSnapshot[]): { upserts: { id: string; isNew: boolean; fields: Record<string, unknown> }[]; removedIds: string[] } {
    const known = new Set(existing.map(row => row.id));
    const kept = new Set(nodes.map(node => node.id));
    const removed = new Set(existing.filter(row => !kept.has(row.id)).map(row => row.id));
    return {
        upserts: nodes.map(node => ({ id: node.id, isNew: !known.has(node.id), fields: { ...NodeFields(node), ID: node.id } })),
        removedIds: deleteChildrenFirst(existing, removed),
    };
}

/** @deprecated Use {@link PlanNodeSave}. */
export function planNodeSave(existing: { id: string; parentId: string | null }[], nodes: RubricNodeSnapshot[]): { upserts: { id: string; isNew: boolean; fields: Record<string, unknown> }[]; removedIds: string[] } {
    return PlanNodeSave(existing, nodes);
}

export function ScaleFromRow(row: Record<string, unknown>, levels: Record<string, unknown>[]): RubricScaleSnapshot {
    return {
        id: String(row.ID ?? ''),
        name: String(row.Name ?? ''),
        scaleType: row.ScaleType === 'Numeric' ? 'Numeric' : 'Levels',
        higherIsBetter: row.HigherIsBetter !== false && row.HigherIsBetter !== 0,
        minValue: row.MinValue == null || row.MinValue === '' ? null : Number(row.MinValue),
        maxValue: row.MaxValue == null || row.MaxValue === '' ? null : Number(row.MaxValue),
        step: row.Step == null || row.Step === '' ? null : Number(row.Step),
        levels: levels.map(level => ({
            id: String(level.ID ?? ''),
            label: String(level.Label ?? ''),
            value: Number(level.Value ?? 0),
            normalizedValue: Number(level.NormalizedValue ?? 0),
            description: level.Description == null ? null : String(level.Description),
            sequence: Number(level.Sequence ?? 0),
        })),
    };
}

/** @deprecated Use {@link ScaleFromRow}. */
export function scaleFromRow(row: Record<string, unknown>, levels: Record<string, unknown>[]): RubricScaleSnapshot {
    return ScaleFromRow(row, levels);
}

export function BandFromRow(row: Record<string, unknown>): RubricBandSnapshot {
    return {
        id: String(row.ID ?? ''),
        label: String(row.Label ?? ''),
        description: row.Description == null ? null : String(row.Description),
        minScore: Number(row.MinScore ?? 0),
        maxScore: Number(row.MaxScore ?? 0),
        displayTone: String(row.DisplayTone ?? 'Neutral'),
        sequence: Number(row.Sequence ?? 0),
    };
}

/** @deprecated Use {@link BandFromRow}. */
export function bandFromRow(row: Record<string, unknown>): RubricBandSnapshot {
    return BandFromRow(row);
}

/** New bands keep the client id. Bands missing from the emit are removed. */
export function PlanBandSave(existingIds: string[], bands: RubricBandSnapshot[]): { upserts: { id: string; isNew: boolean; fields: Record<string, unknown> }[]; removedIds: string[] } {
    const known = new Set(existingIds);
    const kept = new Set(bands.map(band => band.id));
    return {
        upserts: bands.map(band => ({
            id: band.id,
            isNew: !known.has(band.id),
            fields: { ID: band.id, Label: band.label, Description: band.description ?? null, MinScore: band.minScore, MaxScore: band.maxScore, DisplayTone: band.displayTone, Sequence: band.sequence },
        })),
        removedIds: existingIds.filter(id => !kept.has(id)),
    };
}

/** @deprecated Use {@link PlanBandSave}. */
export function planBandSave(existingIds: string[], bands: RubricBandSnapshot[]): { upserts: { id: string; isNew: boolean; fields: Record<string, unknown> }[]; removedIds: string[] } {
    return PlanBandSave(existingIds, bands);
}

function deleteChildrenFirst(rows: { id: string; parentId: string | null }[], removed: Set<string>): string[] {
    const ordered: string[] = [];
    const visit = (id: string): void => {
        for (const row of rows) {
            if (row.parentId === id && removed.has(row.id)) visit(row.id);
        }
        if (removed.has(id) && !ordered.includes(id)) ordered.push(id);
    };
    for (const id of removed) visit(id);
    return ordered;
}

/** Fields the Explorer form writes back when the author emits a node. */
export function NodeFields(node: RubricNodeSnapshot): Record<string, unknown> {
    return {
        Key: node.key,
        Name: node.name,
        Description: node.description ?? null,
        ParentID: node.parentId ?? null,
        NodeType: node.nodeType,
        ScaleID: node.scaleId ?? null,
        Weight: node.weight,
        IsAdvisory: node.isAdvisory,
        IsGate: node.isGate,
        GateMinimumScore: node.gateMinimumScore ?? null,
        NotApplicablePolicy: node.notApplicablePolicy ?? null,
        RollupMethod: node.rollupMethod ?? null,
        Guidance: node.guidance ?? null,
        EvidenceRequired: node.evidenceRequired,
        RationaleRequired: node.rationaleRequired,
        Sequence: node.sequence,
    };
}

/** @deprecated Use {@link NodeFields}. */
export function nodeFields(node: RubricNodeSnapshot): Record<string, unknown> {
    return NodeFields(node);
}

function slug(name: string): string {
    const key = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return key.length > 0 ? key : 'criterion';
}

function uniqueKey(nodes: RubricNodeSnapshot[], base: string): string {
    const taken = new Set(nodes.map(node => node.key));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
}

export interface CatalogCriterionInput {
    id: string;
    key: string;
    name: string;
    nodeType: string;
    weight: number;
    scaleId: string | null;
    isGate: boolean;
}

export interface CatalogVersionInput {
    id: string;
    rubricId: string;
    status: string;
    majorVersion: number | null;
    minorVersion: number | null;
    patchVersion: number | null;
    criteria: CatalogCriterionInput[];
}

export interface CatalogRubricInput {
    id: string;
    name: string;
    description: string | null;
    categoryName: string | null;
    versions: CatalogVersionInput[];
    scaleNames: Record<string, string>;
}

export interface CatalogRowView {
    id: string;
    name: string;
    description: string | null;
    categoryName: string;
    publishedLabel: string;
    draftLabel: string;
    criteriaCount: number;
    scaleName: string | null;
}

function catalogSnapshot(version: CatalogVersionInput): RubricVersionSnapshot {
    return {
        id: version.id,
        rubricId: version.rubricId,
        majorVersion: version.majorVersion,
        minorVersion: version.minorVersion,
        patchVersion: version.patchVersion,
        notApplicablePolicy: 'NotAllowed',
        scoreDisplayMin: 0,
        scoreDisplayMax: 1,
        nodes: version.criteria.map((criterion, sequence) => ({
            id: criterion.id,
            key: criterion.key,
            name: criterion.name,
            nodeType: criterion.nodeType === 'Group' ? 'Group' : 'Criterion',
            scaleId: criterion.scaleId,
            weight: criterion.weight,
            isAdvisory: false,
            isGate: criterion.isGate,
            gateMinimumScore: criterion.isGate ? 1 : null,
            evidenceRequired: false,
            rationaleRequired: false,
            sequence,
        })),
        scales: [],
        bands: [],
    };
}

function versionLabel(version: CatalogVersionInput | null): string | null {
    if (!version || version.majorVersion == null || version.minorVersion == null || version.patchVersion == null) return null;
    return `${version.majorVersion}.${version.minorVersion}.${version.patchVersion}`;
}

/** One catalog row. Draft text comes from publishPreview, so null version numbers are never printed. */
export function CatalogRow(input: CatalogRubricInput): CatalogRowView {
    const published = input.versions.find(version => version.status === 'Published') ?? null;
    const draft = input.versions.find(version => version.status === 'Draft') ?? null;
    const shown = draft ?? published;
    const leaves = (shown?.criteria ?? []).filter(criterion => criterion.nodeType !== 'Group');
    const scaleName = leaves.map(leaf => leaf.scaleId).filter((id): id is string => !!id).map(id => input.scaleNames[id.toLowerCase()]).find(name => !!name) ?? null;
    let draftLabel = 'none';
    if (draft) {
        const preview = publishPreview(published ? catalogSnapshot(published) : null, catalogSnapshot(draft));
        draftLabel = preview.nextVersion && preview.computedBump ? `${preview.nextVersion} draft, ${preview.computedBump}` : 'draft';
    }
    return {
        id: input.id,
        name: input.name,
        description: input.description,
        categoryName: input.categoryName && input.categoryName.trim() ? input.categoryName : 'No category',
        publishedLabel: versionLabel(published) ?? 'No published version',
        draftLabel,
        criteriaCount: leaves.length,
        scaleName,
    };
}

/** @deprecated Use {@link CatalogRow}. */
export function catalogRow(input: CatalogRubricInput): CatalogRowView {
    return CatalogRow(input);
}
