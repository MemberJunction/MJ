import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { HighestNonDraftVersion, RubricVersionDiff, SnapshotFromRows, sha256Hex, type RubricNodeSnapshot, type RubricVersionSnapshot, type VersionBump } from '@memberjunction/rubrics-base';

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
    changeDetails: {
        BaseVersionID: string | null;
        Changes: { Path: string; Property: string; From: unknown; To: unknown; Bump: string }[];
    };
    contentHash: string;
    scoringHash: string;
    warnings: PublishWarning[];
    publishedAt: Date;
}

/**
 * Refuses a draft that cannot be published: duplicate keys, a missing or cyclic parent,
 * a criterion with no scale, a gate with no minimum, a criterion that has children,
 * an empty group, a non-advisory leaf under an advisory group, bands that overlap or
 * leave a gap in 0..1, or a version with no non-advisory leaf. Warns when a group's
 * non-advisory children are all weight 0, and when a gate's effective not-applicable
 * policy is ExcludeAndRedistribute.
 */
export function ValidateRubricTree(version: RubricVersionSnapshot): { errors: string[]; warnings: PublishWarning[] } {
    const errors: string[] = [];
    const warnings: PublishWarning[] = [];
    const byId = new Map(version.nodes.map(node => [NormalizeUUID(node.id), node]));
    const keys = new Set<string>();
    const childrenOf = (id: string) => version.nodes.filter(item => UUIDsEqual(item.parentId, id));
    for (const node of version.nodes) {
        if (keys.has(node.key)) errors.push(`Duplicate key ${node.key}.`);
        keys.add(node.key);
        if (node.parentId && !byId.has(NormalizeUUID(node.parentId))) errors.push(`${node.key} points at a missing parent.`);
        if (node.nodeType === 'Criterion' && !node.scaleId) errors.push(`${node.key} is a criterion with no scale.`);
        if (node.nodeType === 'Criterion' && childrenOf(node.id).length > 0) {
            errors.push(`${node.key} is a criterion with children, so a child gate is ignored.`);
        }
        if (node.nodeType === 'Group' && childrenOf(node.id).length === 0) {
            errors.push(`${node.key} is an empty group.`);
        }
        if (node.scaleId && !version.scales.some(scale => UUIDsEqual(scale.id, node.scaleId))) {
            errors.push(`${node.key} names a scale that is not on this version.`);
        }
        if (node.isGate && (node.gateMinimumScore === undefined || node.gateMinimumScore === null)) {
            errors.push(`${node.key} is a gate with no minimum score.`);
        }
        const policy = node.notApplicablePolicy ?? version.notApplicablePolicy;
        if (node.isGate && !node.isAdvisory && policy === 'ExcludeAndRedistribute') {
            warnings.push({ severity: 'warning', message: `Gate ${node.key} excludes not-applicable answers, so silence and not-applicable are easy to confuse.` });
        }
    }
    if (hasCycle(version.nodes)) errors.push('The criteria tree has a cycle.');
    for (const leaf of version.nodes.filter(node => node.nodeType === 'Criterion' && !node.isAdvisory)) {
        const seen = new Set<string>();
        let parentId = leaf.parentId;
        while (parentId && byId.has(parentId) && !seen.has(parentId)) {
            seen.add(parentId);
            const parent = byId.get(parentId)!;
            if (parent.isAdvisory) {
                errors.push(`${leaf.key} is a non-advisory leaf under the advisory group ${parent.key}.`);
                break;
            }
            parentId = parent.parentId;
        }
    }
    if (!version.nodes.some(node => node.nodeType === 'Criterion' && !node.isAdvisory)) {
        errors.push('A version needs a non-advisory leaf.');
    }
    for (const node of version.nodes.filter(item => item.nodeType === 'Group')) {
        const children = childrenOf(node.id).filter(child => !child.isAdvisory);
        if (children.length > 0 && children.every(child => child.weight === 0)) {
            warnings.push({ severity: 'warning', message: `Group ${node.key} has only zero-weight children, so they share the score equally.` });
        }
    }
    errors.push(...bandCoverageErrors(version.bands));
    return { errors, warnings };
}

/** Bands are optional. When present they tile 0..1: each meets the previous, and the ends are 0 and 1. */
function bandCoverageErrors(bands: RubricVersionSnapshot['bands']): string[] {
    if (bands.length === 0) return [];
    const ordered = [...bands].sort((left, right) => left.minScore - right.minScore || left.maxScore - right.maxScore);
    const errors: string[] = [];
    const near = (left: number, right: number) => Math.abs(left - right) <= 1e-6;
    if (ordered[0].minScore > 1e-6) errors.push(`Bands leave a gap before ${ordered[0].label}.`);
    for (let index = 1; index < ordered.length; index++) {
        const previous = ordered[index - 1];
        const next = ordered[index];
        if (next.minScore < previous.maxScore - 1e-6) errors.push(`Bands ${previous.label} and ${next.label} overlap.`);
        else if (!near(next.minScore, previous.maxScore)) errors.push(`Bands ${previous.label} and ${next.label} leave a gap.`);
    }
    const last = ordered[ordered.length - 1];
    if (last.maxScore < 1 - 1e-6) errors.push(`Bands leave a gap after ${last.label}.`);
    return errors;
}

/** @deprecated Use {@link ValidateRubricTree}. */
export function validateRubricTree(version: RubricVersionSnapshot): { errors: string[]; warnings: PublishWarning[] } {
    return ValidateRubricTree(version);
}

/**
 * Publishes a draft. Refuses an identical draft and a tree that fails
 * {@link validateRubricTree}. Writes the bump from {@link RubricVersionDiff},
 * and ContentHash and ScoringHash from its canonical projections. Does not
 * touch the database.
 */
export async function PublishRubricVersion(
    base: RubricVersionSnapshot | null,
    draft: RubricVersionSnapshot,
    requestedBump?: 'Major' | 'Minor' | 'Patch' | null,
): Promise<PublishResult> {
    const validation = ValidateRubricTree(draft);
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
        changeDetails: {
            BaseVersionID: base?.id ?? null,
            Changes: diff.changes.map(change => ({
                Path: change.subject,
                Property: change.property,
                From: change.from ?? null,
                To: change.to ?? null,
                Bump: change.bump,
            })),
        },
        contentHash: await sha256Hex(RubricVersionDiff.contentCanonical(draft)),
        scoringHash: await sha256Hex(RubricVersionDiff.scoringCanonical(draft)),
        warnings: validation.warnings,
        publishedAt: new Date(),
    };
}

/** @deprecated Use {@link PublishRubricVersion}. */
export async function publishRubricVersion(
    base: RubricVersionSnapshot | null,
    draft: RubricVersionSnapshot,
    requestedBump?: 'Major' | 'Minor' | 'Patch' | null,
): Promise<PublishResult> {
    return PublishRubricVersion(base, draft, requestedBump);
}

/** A new draft: new ids, status left to the caller, keys and parent structure preserved. */
export function CloneVersionNodes(nodes: RubricNodeSnapshot[]): RubricNodeSnapshot[] {
    const ids = new Map(nodes.map(node => [node.id, crypto.randomUUID()]));
    return nodes.map(node => ({
        ...node,
        id: ids.get(node.id) as string,
        parentId: node.parentId ? ids.get(node.parentId) ?? null : null,
    }));
}

/** @deprecated Use {@link CloneVersionNodes}. */
export function cloneVersionNodes(nodes: RubricNodeSnapshot[]): RubricNodeSnapshot[] {
    return CloneVersionNodes(nodes);
}

type RowRun = (entityName: string, filter: string) => Promise<{ Success: boolean; Results?: unknown[] }>;

function read(row: unknown, name: string): unknown {
    const record = row as Record<string, unknown> & { Get?: (field: string) => unknown };
    if (record && typeof record.Get === 'function' && record[name] === undefined) return record.Get(name);
    return record?.[name];
}

/**
 * Loads the draft tree and the base version so Save can publish without a separate call.
 * A null base id does not mean "first version" when this rubric already has a
 * Published or Retired version. The base is then the highest of those, so the
 * publish is numbered from that version instead of 1.0.0.
 */
export async function LoadDraftForPublish(run: RowRun, versionId: string, rubricId: string, basedOnVersionId: string | null): Promise<{ base: RubricVersionSnapshot | null; draft: RubricVersionSnapshot }> {
    const draft = await loadSnapshot(run, versionId, rubricId);
    const baseId = basedOnVersionId ?? await highestNonDraftId(run, rubricId, versionId);
    const base = baseId ? await loadSnapshot(run, baseId, rubricId) : null;
    return { base, draft };
}

async function highestNonDraftId(run: RowRun, rubricId: string, exceptVersionId: string): Promise<string | null> {
    const siblings = await rows(run, 'MJ: Rubric Versions', `RubricID='${rubricId}' AND Status <> 'Draft'`);
    const best = HighestNonDraftVersion(siblings.map(row => ({
        id: String(read(row, 'ID') ?? ''),
        status: String(read(row, 'Status') ?? ''),
        major: Number(read(row, 'MajorVersion') ?? 0),
        minor: Number(read(row, 'MinorVersion') ?? 0),
        patch: Number(read(row, 'PatchVersion') ?? 0),
    })).filter(version => version.id !== exceptVersionId));
    return best?.id ?? null;
}

/** @deprecated Use {@link LoadDraftForPublish}. */
export async function loadDraftForPublish(run: RowRun, versionId: string, rubricId: string, basedOnVersionId: string | null): Promise<{ base: RubricVersionSnapshot | null; draft: RubricVersionSnapshot }> {
    return LoadDraftForPublish(run, versionId, rubricId, basedOnVersionId);
}

async function loadSnapshot(run: RowRun, versionId: string, rubricId: string): Promise<RubricVersionSnapshot> {
    const versions = await rows(run, 'MJ: Rubric Versions', `ID='${versionId}'`);
    const version = versions[0];
    if (!version) throw new RubricPublishError([`Version ${versionId} was not found.`]);
    const criteria = await rows(run, 'MJ: Rubric Criteria', `RubricVersionID='${versionId}'`);
    const criterionIds = criteria.map(row => String(read(row, 'ID'))).filter(id => id.length > 0);
    const anchorRows = criterionIds.length === 0
        ? []
        : await rows(run, 'MJ: Rubric Criterion Levels', `CriterionID IN (${criterionIds.map(id => `'${id}'`).join(',')})`);
    const bands = await rows(run, 'MJ: Rubric Bands', `RubricVersionID='${versionId}'`);
    const scaleIds = [...new Set(criteria.map(row => read(row, 'ScaleID')).filter((id): id is string => typeof id === 'string'))];
    const scales = [];
    const levels = [];
    for (const scaleId of scaleIds) {
        const scaleRows = await rows(run, 'MJ: Rubric Scales', `ID='${scaleId}'`);
        const levelRows = await rows(run, 'MJ: Rubric Scale Levels', `ScaleID='${scaleId}'`);
        const scale = scaleRows[0];
        if (!scale) continue;
        scales.push(scale);
        levels.push(...levelRows);
    }
    return SnapshotFromRows({ version, rubricId, criteria, anchors: anchorRows, bands, scales, levels });
}

async function rows(run: RowRun, entityName: string, filter: string): Promise<unknown[]> {
    const result = await run(entityName, filter);
    if (!result.Success) throw new RubricPublishError([`Could not load ${entityName}.`]);
    return result.Results ?? [];
}

function hasCycle(nodes: RubricNodeSnapshot[]): boolean {
    const byId = new Map(nodes.map(node => [NormalizeUUID(node.id), node]));
    const state = new Map<string, 'visiting' | 'done'>();
    const visit = (id: string): boolean => {
        const key = NormalizeUUID(id);
        const mark = state.get(key);
        if (mark === 'visiting') return true;
        if (mark === 'done') return false;
        state.set(key, 'visiting');
        const parentId = byId.get(key)?.parentId;
        if (parentId && byId.has(NormalizeUUID(parentId)) && visit(parentId)) return true;
        state.set(key, 'done');
        return false;
    };
    return nodes.some(node => visit(node.id));
}
