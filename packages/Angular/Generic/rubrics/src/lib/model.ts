import { RubricScoring, type NotApplicablePolicy, type RubricBandSnapshot, type RubricNodeSnapshot, type RubricScaleSnapshot, type RubricScoreResult, type RubricVersionSnapshot } from '@memberjunction/rubrics-base';

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
