import { RubricScoring, RubricVersionDiff, type NotApplicablePolicy, type RubricBandSnapshot, type RubricNodeSnapshot, type RubricScaleSnapshot, type RubricScoreResult, type RubricVersionSnapshot, type VersionChange } from '@memberjunction/rubrics-base';

/** One answer on the scoring form. Groups are not answered. */
export interface RubricFormAnswer {
    criterionId: string;
    scaleLevelId?: string | null;
    isNotApplicable?: boolean;
    rationale?: string;
    evidence?: string;
}

/** Live weight share among a node's included siblings, as a percent. Advisory nodes are left out. */
export function weightShares(nodes: RubricNodeSnapshot[]): Map<string, number> {
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

/** Problems that block a draft from being a publishable tree. */
export function draftProblems(nodes: RubricNodeSnapshot[], scales: RubricScaleSnapshot[]): string[] {
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

/** A new group or leaf. The host saves the draft. The widget does not publish. */
export function addNode(nodes: RubricNodeSnapshot[], name: string, nodeType: 'Group' | 'Criterion', scaleId: string | null, parentId: string | null = null): RubricNodeSnapshot[] {
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

export function addCriterion(nodes: RubricNodeSnapshot[], name: string, scaleId: string | null): RubricNodeSnapshot[] {
    return addNode(nodes, name, 'Criterion', scaleId, null);
}

/**
 * Moving sets the parent and puts the node at the end of that parent's children.
 * A move under the node's own descendant leaves the tree unchanged.
 */
export function moveNode(nodes: RubricNodeSnapshot[], id: string, parentId: string | null): RubricNodeSnapshot[] {
    if (parentId === id || isAncestor(nodes, id, parentId)) return nodes;
    const sequence = nodes.filter(node => node.id !== id && (node.parentId ?? null) === parentId).length;
    return nodes.map(node => node.id === id ? { ...node, parentId, sequence } : node);
}

/** Names the key when the new parent is the node or one of its descendants. */
export function moveProblem(nodes: RubricNodeSnapshot[], id: string, parentId: string | null): string | null {
    if (parentId !== id && !isAncestor(nodes, id, parentId)) return null;
    const node = nodes.find(item => item.id === id);
    return `${node?.key ?? id} cannot be moved under its own descendant.`;
}

export function setWeight(nodes: RubricNodeSnapshot[], id: string, weight: number): RubricNodeSnapshot[] {
    return nodes.map(node => node.id === id ? { ...node, weight: weight < 0 ? 0 : weight } : node);
}

export function setScale(nodes: RubricNodeSnapshot[], id: string, scaleId: string | null): RubricNodeSnapshot[] {
    return nodes.map(node => node.id === id ? { ...node, scaleId } : node);
}

export function setAnchor(nodes: RubricNodeSnapshot[], id: string, scaleLevelId: string, descriptor: string): RubricNodeSnapshot[] {
    return nodes.map(node => {
        if (node.id !== id) return node;
        const anchors = [...(node.anchors ?? []).filter(anchor => anchor.scaleLevelId !== scaleLevelId), { scaleLevelId, descriptor }];
        return { ...node, anchors };
    });
}

export function setGate(nodes: RubricNodeSnapshot[], id: string, isGate: boolean, gateMinimumScore: number | null): RubricNodeSnapshot[] {
    return nodes.map(node => node.id === id ? { ...node, isGate, gateMinimumScore: isGate ? gateMinimumScore : null } : node);
}

export function setPolicy(nodes: RubricNodeSnapshot[], id: string, notApplicablePolicy: NotApplicablePolicy | null): RubricNodeSnapshot[] {
    return nodes.map(node => node.id === id ? { ...node, notApplicablePolicy } : node);
}

export function addBand(bands: RubricBandSnapshot[], label: string): RubricBandSnapshot[] {
    return [...bands, { id: crypto.randomUUID(), label, minScore: 0, maxScore: 1, displayTone: 'Neutral', sequence: bands.length }];
}

export function updateBand(bands: RubricBandSnapshot[], id: string, patch: Partial<Pick<RubricBandSnapshot, 'label' | 'minScore' | 'maxScore'>>): RubricBandSnapshot[] {
    return bands.map(band => band.id === id ? { ...band, ...patch } : band);
}

/** Anchor text shown beside one scale level. */
export function anchorsForLevel(node: RubricNodeSnapshot, levelId: string): { descriptor: string }[] {
    return (node.anchors ?? []).filter(anchor => anchor.scaleLevelId === levelId && (anchor.descriptor ?? '').trim().length > 0);
}

export function effectivePolicy(node: RubricNodeSnapshot, versionPolicy: NotApplicablePolicy): NotApplicablePolicy {
    return node.notApplicablePolicy ?? versionPolicy;
}

/**
 * Names the leaves that still need an answer, a required rationale, or required evidence.
 * An unanswered advisory leaf does not block submit. NotAllowed refuses a not-applicable answer.
 */
export function incompleteAnswers(nodes: RubricNodeSnapshot[], answers: RubricFormAnswer[], versionPolicy: NotApplicablePolicy = 'ExcludeAndRedistribute'): string[] {
    const missing: string[] = [];
    for (const node of nodes.filter(item => item.nodeType === 'Criterion')) {
        const answer = answers.find(item => item.criterionId === node.id);
        const policy = effectivePolicy(node, versionPolicy);
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

export function canSubmit(nodes: RubricNodeSnapshot[], answers: RubricFormAnswer[], versionPolicy: NotApplicablePolicy = 'ExcludeAndRedistribute'): boolean {
    return incompleteAnswers(nodes, answers, versionPolicy).length === 0;
}

/**
 * Selects a level, or clears it when the leaf is marked not applicable.
 * NotAllowed leaves the answers unchanged, so N does not clear the level.
 */
export function answerLevel(answers: RubricFormAnswer[], criterionId: string, scaleLevelId: string | null, notApplicable: boolean, policy: NotApplicablePolicy = 'ExcludeAndRedistribute'): RubricFormAnswer[] {
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

/** Scores the sample answers with RubricScoring. The widget does not keep a second copy of the math. */
export function previewScore(version: RubricVersionSnapshot, answers: RubricFormAnswer[]): RubricScoreResult {
    return RubricScoring.compute({
        version,
        answers: answers.filter(item => item.scaleLevelId || item.isNotApplicable).map(item => ({
            criterionId: item.criterionId,
            scaleLevelId: item.scaleLevelId,
            isNotApplicable: item.isNotApplicable,
        })),
    });
}

/** Maps a 0..1 score onto the version's display range. Null stays null. */
export function displayScore(normalized: number | null, min: number, max: number): number | null {
    if (normalized === null) return null;
    return min + normalized * (max - min);
}

/**
 * The same half-open rule as RubricScoring.bandId. A score equal to a band's max
 * belongs to the next band. The band whose max is 1 also contains 1.
 */
export function bandFor(normalized: number | null, bands: RubricBandSnapshot[]): RubricBandSnapshot | null {
    if (normalized === null) return null;
    const ordered = [...bands].sort((a, b) => a.minScore - b.minScore || a.maxScore - b.maxScore);
    for (const band of ordered) {
        const top = band.maxScore === 1 && normalized === 1;
        if (normalized >= band.minScore && (normalized < band.maxScore || top)) return band;
    }
    return null;
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
export function publishPreview(base: RubricVersionSnapshot | null, draft: RubricVersionSnapshot, requested?: 'Major' | 'Minor' | 'Patch' | null): PublishPreview {
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

export interface DiffRow {
    key: string;
    left: string | null;
    right: string | null;
    marks: string[];
}

/** Criterion keys, plus one row for each change that is not a criterion (version, band, or scale). */
export function versionRows(base: RubricVersionSnapshot, draft: RubricVersionSnapshot): DiffRow[] {
    const diff = RubricVersionDiff.diff(base, draft);
    const keys = [...new Set([...base.nodes.map(node => node.key), ...draft.nodes.map(node => node.key)])];
    const rows: DiffRow[] = keys.map(key => ({
        key,
        left: base.nodes.find(node => node.key === key)?.name ?? null,
        right: draft.nodes.find(node => node.key === key)?.name ?? null,
        marks: diff.changes.filter(change => change.subject === key).map(mark),
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
            marks: changes.map(mark),
        });
    }
    return rows;
}

function mark(change: VersionChange): string {
    return `${change.property} (${change.bump})`;
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
    evaluatorType: 'Human' | 'AI' | 'Self' | 'Deterministic';
    status: string;
    scores: { key: string; normalizedScore: number | null }[];
}

export interface MatrixModel {
    rows: { key: string; cells: { columnId: string; score: number | null; disagree: boolean }[] }[];
    humanMean: number | null;
    aiMean: number | null;
    selfScore: number | null;
}

/** Evaluators across, criteria down. A cell disagrees when the other included scores on that row differ. Withdrawn columns stay visible and out of the means. */
export function comparisonMatrix(keys: string[], columns: MatrixColumn[]): MatrixModel {
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
        aiMean: meanOf(columns.filter(column => column.evaluatorType === 'AI' && column.status !== 'Withdrawn')),
        selfScore: meanOf(columns.filter(column => column.evaluatorType === 'Self' && column.status !== 'Withdrawn')),
    };
}

function meanOf(columns: MatrixColumn[]): number | null {
    const scores = columns.flatMap(column => column.scores.map(score => score.normalizedScore)).filter((score): score is number => score !== null);
    if (scores.length === 0) return null;
    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

/** A criterion row from MJ: Rubric Criteria, as the author widget expects it. */
export function nodeFromRow(row: Record<string, unknown>, anchors: RubricNodeSnapshot['anchors'] = []): RubricNodeSnapshot {
    return {
        id: String(row.ID ?? ''),
        key: String(row.Key ?? ''),
        name: String(row.Name ?? ''),
        parentId: row.ParentID == null || row.ParentID === '' ? null : String(row.ParentID),
        nodeType: row.NodeType === 'Group' ? 'Group' : 'Criterion',
        scaleId: row.ScaleID == null || row.ScaleID === '' ? null : String(row.ScaleID),
        weight: Number(row.Weight ?? 1),
        isAdvisory: row.IsAdvisory === true || row.IsAdvisory === 1,
        isGate: row.IsGate === true || row.IsGate === 1,
        gateMinimumScore: row.GateMinimumScore == null || row.GateMinimumScore === '' ? null : Number(row.GateMinimumScore),
        notApplicablePolicy: (row.NotApplicablePolicy as NotApplicablePolicy | null) ?? null,
        evidenceRequired: row.EvidenceRequired === true || row.EvidenceRequired === 1,
        rationaleRequired: row.RationaleRequired === true || row.RationaleRequired === 1,
        sequence: Number(row.Sequence ?? 0),
        guidance: row.Guidance == null || row.Guidance === '' ? null : String(row.Guidance),
        anchors,
    };
}

/** Writes include the client id, so a new row is stored under the id the form already holds. Removed ids are deleted children first. */
export function planNodeSave(existing: { id: string; parentId: string | null }[], nodes: RubricNodeSnapshot[]): { upserts: { id: string; isNew: boolean; fields: Record<string, unknown> }[]; removedIds: string[] } {
    const known = new Set(existing.map(row => row.id));
    const kept = new Set(nodes.map(node => node.id));
    const removed = new Set(existing.filter(row => !kept.has(row.id)).map(row => row.id));
    return {
        upserts: nodes.map(node => ({ id: node.id, isNew: !known.has(node.id), fields: { ...nodeFields(node), ID: node.id } })),
        removedIds: deleteChildrenFirst(existing, removed),
    };
}

export function scaleFromRow(row: Record<string, unknown>, levels: Record<string, unknown>[]): RubricScaleSnapshot {
    return {
        id: String(row.ID ?? ''),
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

export function bandFromRow(row: Record<string, unknown>): RubricBandSnapshot {
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
export function planBandSave(existingIds: string[], bands: RubricBandSnapshot[]): { upserts: { id: string; isNew: boolean; fields: Record<string, unknown> }[]; removedIds: string[] } {
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
export function nodeFields(node: RubricNodeSnapshot): Record<string, unknown> {
    return {
        Key: node.key,
        Name: node.name,
        ParentID: node.parentId ?? null,
        NodeType: node.nodeType,
        ScaleID: node.scaleId ?? null,
        Weight: node.weight,
        IsAdvisory: node.isAdvisory,
        IsGate: node.isGate,
        GateMinimumScore: node.gateMinimumScore ?? null,
        NotApplicablePolicy: node.notApplicablePolicy ?? null,
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
