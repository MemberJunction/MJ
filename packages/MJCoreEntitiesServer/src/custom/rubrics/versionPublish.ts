import { RubricVersionDiff, sha256Hex, type RubricNodeSnapshot, type RubricVersionSnapshot, type VersionBump } from '@memberjunction/rubrics-base';

export class RubricPublishError extends Error {
    public readonly details: string[];
    public constructor(details: string[]) {
        super(details.join(' '));
        this.name = 'RubricPublishError';
        this.details = details;
    }
}

export interface PublishWarning {
    severity: 'warning';
    message: string;
}

export interface PublishResult {
    appliedBump: VersionBump;
    computedBump: 'Major' | 'Minor' | 'Patch' | 'Initial';
    majorVersion: number;
    minorVersion: number;
    patchVersion: number;
    changeDetails: { bump: string; subject: string; property: string }[];
    contentHash: string;
    scoringHash: string;
    warnings: PublishWarning[];
}

/**
 * Refuses a draft that cannot be published: duplicate keys, a missing or cyclic parent,
 * a criterion with no scale, or a gate with no minimum. Warns when a group's
 * non-advisory children are all weight 0, and when a gate's effective not-applicable
 * policy is ExcludeAndRedistribute.
 */
export function validateRubricTree(version: RubricVersionSnapshot): { errors: string[]; warnings: PublishWarning[] } {
    const errors: string[] = [];
    const warnings: PublishWarning[] = [];
    const byId = new Map(version.nodes.map(node => [node.id, node]));
    const keys = new Set<string>();
    for (const node of version.nodes) {
        if (keys.has(node.key)) errors.push(`Duplicate key ${node.key}.`);
        keys.add(node.key);
        if (node.parentId && !byId.has(node.parentId)) errors.push(`${node.key} points at a missing parent.`);
        if (node.nodeType === 'Criterion' && !node.scaleId) errors.push(`${node.key} is a criterion with no scale.`);
        if (node.isGate && (node.gateMinimumScore === undefined || node.gateMinimumScore === null)) {
            errors.push(`${node.key} is a gate with no minimum score.`);
        }
        const policy = node.notApplicablePolicy ?? version.notApplicablePolicy;
        if (node.isGate && !node.isAdvisory && policy === 'ExcludeAndRedistribute') {
            warnings.push({ severity: 'warning', message: `Gate ${node.key} excludes not-applicable answers, so silence and not-applicable are easy to confuse.` });
        }
    }
    if (hasCycle(version.nodes)) errors.push('The criteria tree has a cycle.');
    for (const node of version.nodes.filter(item => item.nodeType === 'Group')) {
        const children = version.nodes.filter(item => item.parentId === node.id && !item.isAdvisory);
        if (children.length > 0 && children.every(child => child.weight === 0)) {
            warnings.push({ severity: 'warning', message: `Group ${node.key} has only zero-weight children, so they share the score equally.` });
        }
    }
    return { errors, warnings };
}

/**
 * Publishes a draft. Refuses an identical draft and a tree that fails
 * {@link validateRubricTree}. Writes the bump from {@link RubricVersionDiff},
 * and ContentHash and ScoringHash from its canonical projections. Does not
 * touch the database.
 */
export async function publishRubricVersion(
    base: RubricVersionSnapshot | null,
    draft: RubricVersionSnapshot,
    requestedBump?: 'Major' | 'Minor' | 'Patch' | null,
): Promise<PublishResult> {
    const validation = validateRubricTree(draft);
    if (validation.errors.length > 0) throw new RubricPublishError(validation.errors);
    const diff = RubricVersionDiff.diff(base, draft, requestedBump);
    if (!diff.appliedBump || !diff.nextVersion) {
        throw new RubricPublishError(['This draft is identical to its base and cannot be published.']);
    }
    return {
        appliedBump: diff.appliedBump,
        computedBump: diff.appliedBump === 'Initial' ? 'Initial' : (diff.computedBump ?? diff.appliedBump),
        majorVersion: diff.nextVersion.major,
        minorVersion: diff.nextVersion.minor,
        patchVersion: diff.nextVersion.patch,
        changeDetails: diff.changes,
        contentHash: await sha256Hex(RubricVersionDiff.contentCanonical(draft)),
        scoringHash: await sha256Hex(RubricVersionDiff.scoringCanonical(draft)),
        warnings: validation.warnings,
    };
}

/** A new draft: new ids, status left to the caller, keys and parent structure preserved. */
export function cloneVersionNodes(nodes: RubricNodeSnapshot[]): RubricNodeSnapshot[] {
    const ids = new Map(nodes.map(node => [node.id, crypto.randomUUID()]));
    return nodes.map(node => ({
        ...node,
        id: ids.get(node.id) as string,
        parentId: node.parentId ? ids.get(node.parentId) ?? null : null,
    }));
}

function hasCycle(nodes: RubricNodeSnapshot[]): boolean {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const state = new Map<string, 'visiting' | 'done'>();
    const visit = (id: string): boolean => {
        const mark = state.get(id);
        if (mark === 'visiting') return true;
        if (mark === 'done') return false;
        state.set(id, 'visiting');
        const parentId = byId.get(id)?.parentId;
        if (parentId && byId.has(parentId) && visit(parentId)) return true;
        state.set(id, 'done');
        return false;
    };
    return nodes.some(node => visit(node.id));
}
