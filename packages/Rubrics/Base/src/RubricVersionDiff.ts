import { canonicalJson, contentProjection, scoringProjection } from './canonical.js';
import type { RubricNodeSnapshot, RubricVersionSnapshot, VersionBump, VersionChange, VersionDiffResult } from './types.js';

const RANK: Record<'Patch' | 'Minor' | 'Major', number> = { Patch: 1, Minor: 2, Major: 3 };

/**
 * Classifies a draft against the version it was cloned from.
 *
 * The bump describes whether scores stay comparable, not which rows moved.
 * Major: a non-advisory node was added or removed, or a node's key, parent, type,
 * weight, scale, advisory flag, gate, gate minimum, not-applicable policy, rollup,
 * or evaluator config changed, or the version's not-applicable policy changed.
 * Minor: the pass threshold or minimum completeness changed, a band's range or tone
 * changed, an advisory node was added or removed, or evidence/rationale requirements changed.
 * Patch: wording, sequence, and display range only.
 *
 * The highest change wins. AppliedBump is the max of that and the author's request;
 * the author may go higher and may not go lower. The first publish, with no base,
 * is 1.0.0 and Initial. A draft identical to its base cannot be published.
 *
 * Parent links are compared by the parent key. A clone assigns new ids, so comparing
 * ParentID strings would mark every node major.
 */
export class RubricVersionDiff {
    public static diff(
        base: RubricVersionSnapshot | null,
        draft: RubricVersionSnapshot,
        requestedBump?: 'Major' | 'Minor' | 'Patch' | null,
    ): VersionDiffResult {
        if (!base) {
            return {
                changes: [],
                computedBump: null,
                appliedBump: 'Initial',
                nextVersion: { major: 1, minor: 0, patch: 0 },
            };
        }
        const changes = RubricVersionDiff.collect(base, draft);
        const computedBump = RubricVersionDiff.highest(changes);
        if (!computedBump) {
            return { changes, computedBump: null, appliedBump: null, nextVersion: null };
        }
        const applied = RubricVersionDiff.applyRequest(computedBump, requestedBump ?? null);
        return {
            changes,
            computedBump,
            appliedBump: applied,
            nextVersion: RubricVersionDiff.nextNumber(base, applied),
        };
    }

    /** Canonical major-row projection. Hash this for ScoringHash. */
    public static scoringCanonical(version: RubricVersionSnapshot): string {
        return canonicalJson(scoringProjection(version));
    }

    /** Canonical full projection. Hash this for ContentHash. */
    public static contentCanonical(version: RubricVersionSnapshot): string {
        return canonicalJson(contentProjection(version));
    }

    private static collect(base: RubricVersionSnapshot, draft: RubricVersionSnapshot): VersionChange[] {
        const changes: VersionChange[] = [];
        if (base.notApplicablePolicy !== draft.notApplicablePolicy) {
            changes.push({ bump: 'Major', subject: 'version', property: 'NotApplicablePolicy' });
        }
        RubricVersionDiff.pushScalar(changes, 'Minor', 'version', 'PassThreshold', base.passThreshold ?? null, draft.passThreshold ?? null);
        RubricVersionDiff.pushScalar(changes, 'Minor', 'version', 'MinimumCompleteness', base.minimumCompleteness ?? null, draft.minimumCompleteness ?? null);
        RubricVersionDiff.pushScalar(changes, 'Patch', 'version', 'Instructions', base.instructions ?? null, draft.instructions ?? null);
        RubricVersionDiff.pushScalar(changes, 'Patch', 'version', 'ScoreDisplayMin', base.scoreDisplayMin, draft.scoreDisplayMin);
        RubricVersionDiff.pushScalar(changes, 'Patch', 'version', 'ScoreDisplayMax', base.scoreDisplayMax, draft.scoreDisplayMax);

        const baseNodes = new Map(base.nodes.map(node => [node.key, node]));
        const draftNodes = new Map(draft.nodes.map(node => [node.key, node]));
        for (const [key, node] of draftNodes) {
            const previous = baseNodes.get(key);
            if (!previous) {
                changes.push({ bump: node.isAdvisory ? 'Minor' : 'Major', subject: key, property: 'added' });
                continue;
            }
            RubricVersionDiff.diffNode(changes, base, draft, previous, node);
        }
        for (const [key, node] of baseNodes) {
            if (!draftNodes.has(key)) {
                changes.push({ bump: node.isAdvisory ? 'Minor' : 'Major', subject: key, property: 'removed' });
            }
        }
        RubricVersionDiff.diffBands(changes, base, draft);
        return changes;
    }

    private static diffNode(
        changes: VersionChange[],
        base: RubricVersionSnapshot,
        draft: RubricVersionSnapshot,
        previous: RubricNodeSnapshot,
        node: RubricNodeSnapshot,
    ): void {
        const subject = node.key;
        const parentWas = RubricVersionDiff.parentKey(base, previous);
        const parentNow = RubricVersionDiff.parentKey(draft, node);
        RubricVersionDiff.pushScalar(changes, 'Major', subject, 'ParentID', parentWas, parentNow);
        RubricVersionDiff.pushScalar(changes, 'Major', subject, 'NodeType', previous.nodeType, node.nodeType);
        RubricVersionDiff.pushScalar(changes, 'Major', subject, 'Weight', previous.weight, node.weight);
        RubricVersionDiff.pushScalar(changes, 'Major', subject, 'ScaleID', previous.scaleId ?? null, node.scaleId ?? null);
        RubricVersionDiff.pushScalar(changes, 'Major', subject, 'IsAdvisory', previous.isAdvisory, node.isAdvisory);
        RubricVersionDiff.pushScalar(changes, 'Major', subject, 'IsGate', previous.isGate, node.isGate);
        RubricVersionDiff.pushScalar(changes, 'Major', subject, 'GateMinimumScore', previous.gateMinimumScore ?? null, node.gateMinimumScore ?? null);
        RubricVersionDiff.pushScalar(changes, 'Major', subject, 'NotApplicablePolicy', previous.notApplicablePolicy ?? null, node.notApplicablePolicy ?? null);
        RubricVersionDiff.pushScalar(changes, 'Major', subject, 'RollupMethod', previous.rollupMethod ?? null, node.rollupMethod ?? null);
        RubricVersionDiff.pushScalar(changes, 'Major', subject, 'EvaluatorConfig', canonicalJson(previous.evaluatorConfig ?? null), canonicalJson(node.evaluatorConfig ?? null));
        RubricVersionDiff.pushScalar(changes, 'Minor', subject, 'EvidenceRequired', previous.evidenceRequired, node.evidenceRequired);
        RubricVersionDiff.pushScalar(changes, 'Minor', subject, 'RationaleRequired', previous.rationaleRequired, node.rationaleRequired);
        RubricVersionDiff.pushScalar(changes, 'Patch', subject, 'Name', previous.name, node.name);
        RubricVersionDiff.pushScalar(changes, 'Patch', subject, 'Description', previous.description ?? null, node.description ?? null);
        RubricVersionDiff.pushScalar(changes, 'Patch', subject, 'Guidance', previous.guidance ?? null, node.guidance ?? null);
        RubricVersionDiff.pushScalar(changes, 'Patch', subject, 'Sequence', previous.sequence, node.sequence);
        const previousDescriptors = (previous.anchors ?? []).map(anchor => anchor.descriptor).join('\n');
        const descriptors = (node.anchors ?? []).map(anchor => anchor.descriptor).join('\n');
        RubricVersionDiff.pushScalar(changes, 'Patch', subject, 'Descriptor', previousDescriptors, descriptors);
    }

    private static diffBands(changes: VersionChange[], base: RubricVersionSnapshot, draft: RubricVersionSnapshot): void {
        const before = new Map(base.bands.map(band => [band.id, band]));
        const after = new Map(draft.bands.map(band => [band.id, band]));
        for (const [id, band] of after) {
            const previous = before.get(id);
            if (!previous) {
                changes.push({ bump: 'Minor', subject: id, property: 'band added' });
                continue;
            }
            if (previous.minScore !== band.minScore || previous.maxScore !== band.maxScore || previous.displayTone !== band.displayTone) {
                changes.push({ bump: 'Minor', subject: id, property: 'band range' });
            }
            if (previous.label !== band.label || (previous.description ?? null) !== (band.description ?? null)) {
                changes.push({ bump: 'Patch', subject: id, property: 'band wording' });
            }
        }
        for (const [id] of before) {
            if (!after.has(id)) changes.push({ bump: 'Minor', subject: id, property: 'band removed' });
        }
    }

    private static parentKey(version: RubricVersionSnapshot, node: RubricNodeSnapshot): string | null {
        if (!node.parentId) return null;
        return version.nodes.find(item => item.id === node.parentId)?.key ?? node.parentId;
    }

    private static pushScalar(
        changes: VersionChange[],
        bump: 'Major' | 'Minor' | 'Patch',
        subject: string,
        property: string,
        before: unknown,
        after: unknown,
    ): void {
        if (before === after) return;
        if (typeof before === 'number' && typeof after === 'number' && Object.is(before, after)) return;
        changes.push({ bump, subject, property });
    }

    private static highest(changes: VersionChange[]): 'Major' | 'Minor' | 'Patch' | null {
        let best: 'Major' | 'Minor' | 'Patch' | null = null;
        for (const change of changes) {
            if (!best || RANK[change.bump] > RANK[best]) best = change.bump;
        }
        return best;
    }

    private static applyRequest(
        computed: 'Major' | 'Minor' | 'Patch',
        requested: 'Major' | 'Minor' | 'Patch' | null,
    ): 'Major' | 'Minor' | 'Patch' {
        if (!requested || RANK[requested] <= RANK[computed]) return computed;
        return requested;
    }

    private static nextNumber(
        base: RubricVersionSnapshot,
        bump: VersionBump,
    ): { major: number; minor: number; patch: number } {
        const major = base.majorVersion ?? 0;
        const minor = base.minorVersion ?? 0;
        const patch = base.patchVersion ?? 0;
        if (bump === 'Major' || bump === 'Initial') return { major: major + 1, minor: 0, patch: 0 };
        if (bump === 'Minor') return { major, minor: minor + 1, patch: 0 };
        return { major, minor, patch: patch + 1 };
    }
}
