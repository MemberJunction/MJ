import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { BandFor, DraftProblems, EvidenceJson, NodeSnapshotFromRecord, RubricScoring, RubricVersionDiff, SnapshotFromRows, WeightShares, type NotApplicablePolicy, type RubricBandSnapshot, type RubricNodeSnapshot, type RubricScaleSnapshot, type RubricScoreResult, type RubricVersionSnapshot, type SnapshotRows, type VersionChange } from '@memberjunction/rubrics-base';

export { BandFor, DraftProblems, EvidenceJson, WeightShares };

/** One answer on the scoring form. Groups are not answered. */
export interface RubricFormAnswer {
    criterionId: string;
    scaleLevelId?: string | null;
    isNotApplicable?: boolean;
    rationale?: string;
    /** Quote text the scorer typed. The stored column is an evidence list, not this string. */
    evidence?: string;
    /** Numeric and Percentage scales. Level scales leave this empty. */
    rawValue?: number | null;
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

export function AddCriterion(nodes: RubricNodeSnapshot[], name: string, scaleId: string | null): RubricNodeSnapshot[] {
    return AddNode(nodes, name, 'Criterion', scaleId, null);
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

/** Names the key when the new parent is the node or one of its descendants. */
export function MoveProblem(nodes: RubricNodeSnapshot[], id: string, parentId: string | null): string | null {
    if (parentId !== id && !isAncestor(nodes, id, parentId)) return null;
    const node = nodes.find(item => item.id === id);
    return `${node?.key ?? id} cannot be moved under its own descendant.`;
}

export function SetWeight(nodes: RubricNodeSnapshot[], id: string, weight: number): RubricNodeSnapshot[] {
    return nodes.map(node => node.id === id ? { ...node, weight: weight < 0 ? 0 : weight } : node);
}

export function SetScale(nodes: RubricNodeSnapshot[], id: string, scaleId: string | null): RubricNodeSnapshot[] {
    return nodes.map(node => node.id === id ? { ...node, scaleId } : node);
}

export function SetAnchor(nodes: RubricNodeSnapshot[], id: string, scaleLevelId: string, descriptor: string): RubricNodeSnapshot[] {
    return nodes.map(node => {
        if (node.id !== id) return node;
        const anchors = [...(node.anchors ?? []).filter(anchor => anchor.scaleLevelId !== scaleLevelId), { scaleLevelId, descriptor }];
        return { ...node, anchors };
    });
}

export function SetGate(nodes: RubricNodeSnapshot[], id: string, isGate: boolean, gateMinimumScore: number | null): RubricNodeSnapshot[] {
    return nodes.map(node => node.id === id ? { ...node, isGate, gateMinimumScore: isGate ? gateMinimumScore : null } : node);
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

export function AddBand(bands: RubricBandSnapshot[], label: string): RubricBandSnapshot[] {
    return [...bands, { id: crypto.randomUUID(), label, minScore: 0, maxScore: 1, displayTone: 'Neutral', sequence: bands.length }];
}

export function UpdateBand(bands: RubricBandSnapshot[], id: string, patch: Partial<Pick<RubricBandSnapshot, 'label' | 'minScore' | 'maxScore' | 'displayTone' | 'sequence' | 'description'>>): RubricBandSnapshot[] {
    return bands.map(band => band.id === id ? { ...band, ...patch } : band);
}

/** Anchor text shown beside one scale level. */
export function AnchorsForLevel(node: RubricNodeSnapshot, levelId: string): { descriptor: string }[] {
    return (node.anchors ?? []).filter(anchor => anchor.scaleLevelId === levelId && (anchor.descriptor ?? '').trim().length > 0);
}

export function EffectivePolicy(node: RubricNodeSnapshot, versionPolicy: NotApplicablePolicy): NotApplicablePolicy {
    return node.notApplicablePolicy ?? versionPolicy;
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
        if (node.isAdvisory && !hasAnswer(answer) && !answer?.isNotApplicable) continue;
        if (!hasAnswer(answer) && !answer?.isNotApplicable) {
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

function hasAnswer(answer: RubricFormAnswer | undefined): boolean {
    if (!answer) return false;
    if (answer.scaleLevelId) return true;
    return answer.rawValue != null && Number.isFinite(answer.rawValue);
}

/** Same completeness the scorer stores: scored applicable leaves over applicable leaves, rounded to 6 places. */
export function ScoringCompleteness(version: RubricVersionSnapshot, answers: RubricFormAnswer[]): number | null {
    try {
        return RubricScoring.Compute({
            version,
            answers: answers.map(answer => ({
                criterionId: answer.criterionId,
                scaleLevelId: answer.scaleLevelId,
                rawValue: answer.rawValue,
                isNotApplicable: answer.isNotApplicable,
            })),
        }).completeness;
    } catch {
        return null;
    }
}

export function CanSubmit(nodes: RubricNodeSnapshot[], answers: RubricFormAnswer[], versionPolicy: NotApplicablePolicy = 'ExcludeAndRedistribute'): boolean {
    return IncompleteAnswers(nodes, answers, versionPolicy).length === 0;
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
        rawValue: notApplicable || scaleLevelId ? null : previous?.rawValue ?? null,
        isNotApplicable: notApplicable,
        rationale: previous?.rationale,
        evidence: previous?.evidence,
    });
    return next;
}

/** Scores the sample answers with RubricScoring. The widget does not keep a second copy of the math. */
export function PreviewScore(version: RubricVersionSnapshot, answers: RubricFormAnswer[]): RubricScoreResult {
    return RubricScoring.Compute({
        version,
        answers: answers.filter(item => item.scaleLevelId || item.isNotApplicable).map(item => ({
            criterionId: item.criterionId,
            scaleLevelId: item.scaleLevelId,
            isNotApplicable: item.isNotApplicable,
        })),
    });
}

/** Maps a 0..1 score onto the version's display range. Null stays null. */
export function DisplayScore(normalized: number | null, min: number, max: number): number | null {
    if (normalized === null) return null;
    return min + normalized * (max - min);
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

/**
 * The snapshot publish uses. Empty wording becomes blank, so a Guidance box
 * that only holds '' is identical to a base with no guidance.
 */
export function SharedVersion(version: RubricVersionSnapshot): RubricVersionSnapshot {
    return SnapshotFromRows(snapshotRows(version));
}

function snapshotRows(version: RubricVersionSnapshot): SnapshotRows {
    return {
        version: {
            ID: version.id,
            MajorVersion: version.majorVersion ?? null,
            MinorVersion: version.minorVersion ?? null,
            PatchVersion: version.patchVersion ?? null,
            NotApplicablePolicy: version.notApplicablePolicy,
            PassThreshold: version.passThreshold ?? null,
            MinimumCompleteness: version.minimumCompleteness ?? null,
            Instructions: version.instructions ?? null,
            ScoreDisplayMin: version.scoreDisplayMin,
            ScoreDisplayMax: version.scoreDisplayMax,
        },
        rubricId: version.rubricId,
        criteria: version.nodes.map(node => ({
            ID: node.id,
            Key: node.key,
            ParentID: node.parentId ?? null,
            Name: node.name,
            Description: node.description ?? null,
            Guidance: node.guidance ?? null,
            NodeType: node.nodeType,
            ScaleID: node.scaleId ?? null,
            Weight: node.weight,
            IsAdvisory: node.isAdvisory,
            IsGate: node.isGate,
            GateMinimumScore: node.gateMinimumScore ?? null,
            NotApplicablePolicy: node.notApplicablePolicy ?? null,
            RollupMethod: node.rollupMethod ?? null,
            EvidenceRequired: node.evidenceRequired,
            RationaleRequired: node.rationaleRequired,
            Sequence: node.sequence,
            EvaluatorConfig: node.evaluatorConfig ?? null,
        })),
        anchors: version.nodes.flatMap(node => (node.anchors ?? []).map((anchor, sequence) => ({
            ID: `${node.id}:${sequence}`,
            CriterionID: node.id,
            ScaleLevelID: anchor.scaleLevelId ?? null,
            AnchorValue: anchor.anchorValue ?? null,
            Descriptor: anchor.descriptor,
            Sequence: sequence,
        }))),
        bands: version.bands.map(band => ({
            ID: band.id,
            Label: band.label,
            Description: band.description ?? null,
            MinScore: band.minScore,
            MaxScore: band.maxScore,
            DisplayTone: band.displayTone,
            Sequence: band.sequence,
        })),
        scales: version.scales.map(scale => ({
            ID: scale.id,
            ScaleType: scale.scaleType,
            MinValue: scale.minValue ?? null,
            MaxValue: scale.maxValue ?? null,
            Step: scale.step ?? null,
            HigherIsBetter: scale.higherIsBetter,
        })),
        levels: version.scales.flatMap(scale => scale.levels.map(level => ({
            ID: level.id,
            ScaleID: scale.id,
            Label: level.label,
            Value: level.value,
            NormalizedValue: level.normalizedValue,
            Description: level.description ?? null,
            Sequence: level.sequence,
        }))),
    };
}

/** The dialog shows this. Confirming is the host's job. The widget does not publish. */
export function PublishPreview(base: RubricVersionSnapshot | null, draft: RubricVersionSnapshot, requested?: 'Major' | 'Minor' | 'Patch' | null): PublishPreview {
    const diff = RubricVersionDiff.Diff(base ? SharedVersion(base) : null, SharedVersion(draft), requested);
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

/** Keyboard shortcuts apply to the criterion card, not to the rationale or level controls. */
export function ScoringShortcutApplies(tagName: string | undefined): boolean {
    const tag = tagName?.toLowerCase();
    return tag !== 'input' && tag !== 'textarea' && tag !== 'select';
}

/** A requested bump is sent only when the author picked one. Initial is computed, not requested. */
export function ChosenPublishBump(requested: string | null | undefined): 'Major' | 'Minor' | 'Patch' | null {
    return requested === 'Major' || requested === 'Minor' || requested === 'Patch' ? requested : null;
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

export function VersionRows(base: RubricVersionSnapshot, draft: RubricVersionSnapshot): DiffRow[] {
    const leftVersion = SharedVersion(base);
    const rightVersion = SharedVersion(draft);
    const diff = RubricVersionDiff.Diff(leftVersion, rightVersion);
    const keys = [...new Set([...leftVersion.nodes.map(node => node.key), ...rightVersion.nodes.map(node => node.key)])];
    const rows: DiffRow[] = keys.map(key => ({
        key,
        left: leftVersion.nodes.find(node => node.key === key)?.name ?? null,
        right: rightVersion.nodes.find(node => node.key === key)?.name ?? null,
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
            left: sideText(leftVersion, subject),
            right: sideText(rightVersion, subject),
            marks: changes,
        });
    }
    return rows;
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

function meanOf(columns: MatrixColumn[]): number | null {
    const scores = columns.flatMap(column => column.scores.map(score => score.normalizedScore)).filter((score): score is number => score !== null);
    if (scores.length === 0) return null;
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

/** A criterion row from MJ: Rubric Criteria, as the author widget expects it. */
export function NodeFromRow(row: Record<string, unknown>, anchors: RubricNodeSnapshot['anchors'] = []): RubricNodeSnapshot {
    return { ...NodeSnapshotFromRecord(row), anchors };
}

/** How long the author waits after the last keystroke before writing criteria. */
export const NodeSaveDelayMs = 400;

/** One timer for the draft tree. A later keystroke cancels the save that was already waiting. */
export function QueueNodeSave(timer: ReturnType<typeof setTimeout> | null, run: () => void, delayMs = NodeSaveDelayMs): ReturnType<typeof setTimeout> {
    if (timer != null) clearTimeout(timer);
    return setTimeout(run, delayMs);
}

/**
 * Dirty rows only, parents before children. A stored row whose id differs only by case
 * is the same row: it is updated under the stored id, not deleted and inserted.
 * Rows without `fields` are treated as dirty so a caller that only knows ids still writes them.
 */
export function PlanNodeSave(
    existing: { id: string; parentId: string | null; fields?: Record<string, unknown>; anchors?: RubricNodeSnapshot['anchors'] }[],
    nodes: RubricNodeSnapshot[],
): { upserts: { id: string; isNew: boolean; fields: Record<string, unknown> }[]; removedIds: string[] } {
    const storedId = (value: string | null | undefined): string | null => {
        if (value == null) return null;
        const found = existing.find(row => UUIDsEqual(row.id, value));
        return found ? found.id : value;
    };
    const upserts: { id: string; isNew: boolean; fields: Record<string, unknown> }[] = [];
    for (const node of nodes) {
        const match = existing.find(row => UUIDsEqual(row.id, node.id));
        const id = match ? match.id : node.id;
        const fields = { ...NodeFields({ ...node, parentId: storedId(node.parentId ?? null) }), ID: id };
        if (match?.fields && sameStoredFields(match.fields, fields) && sameAnchors(match.anchors, node.anchors)) continue;
        upserts.push({ id, isNew: !match, fields });
    }
    const removed = existing.filter(row => !nodes.some(node => UUIDsEqual(node.id, row.id))).map(row => row.id);
    return { upserts: parentsFirst(upserts), removedIds: deleteChildrenFirst(existing, removed) };
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

const UUID_FIELDS = new Set(['ParentID', 'ScaleID']);

function sameStoredFields(stored: Record<string, unknown>, next: Record<string, unknown>): boolean {
    const keys = new Set([...Object.keys(stored), ...Object.keys(next)].filter(key => key !== 'ID'));
    for (const key of keys) {
        const left = stored[key];
        const right = next[key];
        if (UUID_FIELDS.has(key)) {
            if (!UUIDsEqual(left as string | null | undefined, right as string | null | undefined)) return false;
            continue;
        }
        if (left == null && right == null) continue;
        if (left !== right) return false;
    }
    return true;
}

function sameAnchors(stored: RubricNodeSnapshot['anchors'] | undefined, next: RubricNodeSnapshot['anchors'] | undefined): boolean {
    const rank = (anchor: NonNullable<RubricNodeSnapshot['anchors']>[number]): string =>
        `${NormalizeUUID(anchor.scaleLevelId ?? '')}|${anchor.anchorValue ?? ''}|${anchor.descriptor}`;
    const left = [...(stored ?? [])].map(rank).sort();
    const right = [...(next ?? [])].map(rank).sort();
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Parents in this save land before their children. A parent already stored can be skipped. */
function parentsFirst(items: { id: string; isNew: boolean; fields: Record<string, unknown> }[]): { id: string; isNew: boolean; fields: Record<string, unknown> }[] {
    const pending = [...items];
    const writing = new Set(pending.map(item => NormalizeUUID(item.id)));
    const done = new Set<string>();
    const ordered: typeof pending = [];
    let guard = pending.length;
    while (pending.length > 0 && guard-- >= 0) {
        const index = pending.findIndex(item => {
            const parent = item.fields.ParentID;
            if (parent == null || parent === '') return true;
            const key = NormalizeUUID(String(parent));
            return !writing.has(key) || done.has(key);
        });
        if (index < 0) return ordered.concat(pending);
        const [item] = pending.splice(index, 1);
        done.add(NormalizeUUID(item.id));
        ordered.push(item);
    }
    return ordered.concat(pending);
}

function deleteChildrenFirst(rows: { id: string; parentId: string | null }[], removedIds: string[]): string[] {
    const removed = new Set(removedIds.map(id => NormalizeUUID(id)));
    const ordered: string[] = [];
    const orderedKeys = new Set<string>();
    const visiting = new Set<string>();
    const visit = (id: string): void => {
        const key = NormalizeUUID(id);
        if (visiting.has(key)) return;
        visiting.add(key);
        for (const row of rows) {
            if (row.parentId && UUIDsEqual(row.parentId, id) && removed.has(NormalizeUUID(row.id))) visit(row.id);
        }
        if (removed.has(key) && !orderedKeys.has(key)) {
            orderedKeys.add(key);
            ordered.push(rows.find(row => UUIDsEqual(row.id, id))?.id ?? id);
        }
    };
    for (const id of removedIds) visit(id);
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

/** One catalog row. Draft text comes from PublishPreview, so null version numbers are never printed. */
export function CatalogRow(input: CatalogRubricInput): CatalogRowView {
    const published = input.versions.find(version => version.status === 'Published') ?? null;
    const draft = input.versions.find(version => version.status === 'Draft') ?? null;
    const shown = draft ?? published;
    const leaves = (shown?.criteria ?? []).filter(criterion => criterion.nodeType !== 'Group');
    const scaleName = leaves.map(leaf => leaf.scaleId).filter((id): id is string => !!id).map(id => input.scaleNames[id.toLowerCase()]).find(name => !!name) ?? null;
    let draftLabel = 'none';
    if (draft) {
        const preview = PublishPreview(published ? catalogSnapshot(published) : null, catalogSnapshot(draft));
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

