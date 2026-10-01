import { RubricScoring, type RubricBandSnapshot, type RubricNodeSnapshot, type RubricScaleSnapshot, type RubricScoreResult, type RubricVersionSnapshot } from '@memberjunction/rubrics-base';

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
        if (node.nodeType === 'Criterion' && !node.scaleId) problems.push(`${node.key} needs a scale.`);
        if (node.scaleId && !scales.some(scale => scale.id === node.scaleId)) problems.push(`${node.key} names a missing scale.`);
        if (node.isGate && (node.gateMinimumScore === undefined || node.gateMinimumScore === null)) {
            problems.push(`${node.key} is a gate with no minimum.`);
        }
    }
    return problems;
}

/** A new leaf the author can edit. The host saves the draft. */
export function addCriterion(nodes: RubricNodeSnapshot[], name: string, scaleId: string | null): RubricNodeSnapshot[] {
    const key = uniqueKey(nodes, slug(name));
    return [...nodes, {
        id: crypto.randomUUID(),
        key,
        name,
        nodeType: 'Criterion',
        scaleId,
        weight: 1,
        isAdvisory: false,
        isGate: false,
        evidenceRequired: false,
        rationaleRequired: false,
        sequence: nodes.length,
    }];
}

export function setWeight(nodes: RubricNodeSnapshot[], id: string, weight: number): RubricNodeSnapshot[] {
    return nodes.map(node => node.id === id ? { ...node, weight: weight < 0 ? 0 : weight } : node);
}

/** Names the leaves that still need an answer, a required rationale, or required evidence. */
export function incompleteAnswers(nodes: RubricNodeSnapshot[], answers: RubricFormAnswer[]): string[] {
    const missing: string[] = [];
    for (const node of nodes.filter(item => item.nodeType === 'Criterion')) {
        const answer = answers.find(item => item.criterionId === node.id);
        if (!answer || (!answer.isNotApplicable && !answer.scaleLevelId && answer.scaleLevelId !== '')) {
            if (!answer?.scaleLevelId && !answer?.isNotApplicable) {
                missing.push(`${node.name} is unanswered.`);
                continue;
            }
        }
        if (answer?.isNotApplicable) continue;
        if (node.rationaleRequired && !(answer?.rationale ?? '').trim()) missing.push(`${node.name} requires a rationale.`);
        if (node.evidenceRequired && !(answer?.evidence ?? '').trim()) missing.push(`${node.name} requires evidence.`);
    }
    return missing;
}

export function canSubmit(nodes: RubricNodeSnapshot[], answers: RubricFormAnswer[]): boolean {
    return incompleteAnswers(nodes, answers).length === 0;
}

/** Selects a level, or clears it when the leaf is marked not applicable. */
export function answerLevel(answers: RubricFormAnswer[], criterionId: string, scaleLevelId: string | null, notApplicable: boolean): RubricFormAnswer[] {
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

/** The band whose range contains the normalized score. */
export function bandFor(normalized: number | null, bands: RubricBandSnapshot[]): RubricBandSnapshot | null {
    if (normalized === null) return null;
    return bands.find(band => normalized >= band.minScore && normalized <= band.maxScore) ?? null;
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
