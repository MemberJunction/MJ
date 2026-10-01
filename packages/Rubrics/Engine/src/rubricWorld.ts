import { RubricScoring, RubricVersionDiff, type RubricVersionSnapshot } from '@memberjunction/rubrics-base';

/** Stable names for the integration world. Re-running finds these rows instead of cloning them. */
export const RUBRIC_WORLD = {
    tag: 'IT World',
    category: 'IT World — Agent quality',
    scale: 'IT World — Met / Not met',
    rubric: 'IT World — Agent evaluation',
    agent: 'IT World — Reviewed agent',
    test: 'IT World — Judged test',
} as const;

export interface WorldCriterion {
    Key: string;
    Name: string;
    PublishedWeight: number;
    DraftWeight: number;
    Gate: boolean;
}

/** The tree the world publishes, and the draft that changes Accuracy's weight. */
export function RubricWorldCriteria(): WorldCriterion[] {
    return [
        { Key: 'accuracy', Name: 'Accuracy', PublishedWeight: 1, DraftWeight: 2, Gate: true },
        { Key: 'sourcing', Name: 'Sourcing', PublishedWeight: 1, DraftWeight: 1, Gate: false },
        { Key: 'completeness', Name: 'Completeness', PublishedWeight: 1, DraftWeight: 1, Gate: false },
    ];
}

/** @deprecated Use {@link RubricWorldCriteria}. */
export function rubricWorldCriteria(): WorldCriterion[] {
    return RubricWorldCriteria();
}

function version(weightOf: (criterion: WorldCriterion) => number, ids: { version: string; rubric: string; scale: string; met: string }): RubricVersionSnapshot {
    return {
        id: ids.version,
        rubricId: ids.rubric,
        majorVersion: ids.version === 'published' ? 1 : null,
        minorVersion: ids.version === 'published' ? 0 : null,
        patchVersion: ids.version === 'published' ? 0 : null,
        notApplicablePolicy: 'NotAllowed',
        passThreshold: 0.6,
        scoreDisplayMin: 0,
        scoreDisplayMax: 1,
        nodes: RubricWorldCriteria().map((criterion, sequence) => ({
            id: `${ids.version}-${criterion.Key}`,
            key: criterion.Key,
            name: criterion.Name,
            nodeType: 'Criterion' as const,
            scaleId: ids.scale,
            weight: weightOf(criterion),
            isAdvisory: false,
            isGate: criterion.Gate,
            gateMinimumScore: criterion.Gate ? 1 : null,
            evidenceRequired: false,
            rationaleRequired: true,
            sequence,
        })),
        scales: [{
            id: ids.scale,
            name: RUBRIC_WORLD.scale,
            scaleType: 'Levels',
            higherIsBetter: true,
            levels: [
                { id: 'not-met', label: 'Not met', value: 0, normalizedValue: 0, sequence: 0 },
                { id: ids.met, label: 'Met', value: 1, normalizedValue: 1, sequence: 1 },
            ],
        }],
        bands: [{ id: `${ids.version}-good`, label: 'Good', minScore: 0.6, maxScore: 1, displayTone: 'Success', sequence: 0 }],
    };
}

const ids = { rubric: 'world-rubric', scale: 'world-scale', met: 'met' };

/** Published 1.0.0. Accuracy weighs 1 and is a gate at Met. */
export function PublishedWorld(): RubricVersionSnapshot {
    return version(criterion => criterion.PublishedWeight, { ...ids, version: 'published' });
}

/** @deprecated Use {@link PublishedWorld}. */
export function publishedWorld(): RubricVersionSnapshot {
    return PublishedWorld();
}

/** Draft based on that publish. Accuracy weighs 2, so the bump is Major and the next version is 2.0.0. */
export function DraftWorld(): RubricVersionSnapshot {
    return version(criterion => criterion.DraftWeight, { ...ids, version: 'draft' });
}

/** @deprecated Use {@link DraftWorld}. */
export function draftWorld(): RubricVersionSnapshot {
    return DraftWorld();
}

/** A human who marks every leaf Met passes the published tree. */
export function ScorePublishedMet(): { outcome: string; normalizedScore: number | null; bump: string | null; nextVersion: string | null } {
    const published = PublishedWorld();
    const draft = DraftWorld();
    const score = RubricScoring.compute({
        version: published,
        answers: published.nodes.map(node => ({ criterionId: node.id, scaleLevelId: 'met', rationale: 'Met in the world model.' })),
    });
    const preview = RubricVersionDiff.diff(published, draft, null);
    const next = preview.nextVersion;
    return {
        outcome: score.outcome,
        normalizedScore: score.normalizedScore,
        bump: preview.computedBump,
        nextVersion: next ? `${next.major}.${next.minor}.${next.patch}` : null,
    };
}

/** @deprecated Use {@link ScorePublishedMet}. */
export function scorePublishedMet(): { outcome: string; normalizedScore: number | null; bump: string | null; nextVersion: string | null } {
    return ScorePublishedMet();
}
