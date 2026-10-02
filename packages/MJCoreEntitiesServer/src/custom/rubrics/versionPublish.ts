import { RubricVersionDiff, SnapshotFromRows, sha256Hex, type RubricNodeSnapshot, type RubricVersionSnapshot, type VersionBump } from '@memberjunction/rubrics-base';

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
 * a criterion with no scale, or a gate with no minimum. Warns when a group's
 * non-advisory children are all weight 0, and when a gate's effective not-applicable
 * policy is ExcludeAndRedistribute.
 */
export function ValidateRubricTree(version: RubricVersionSnapshot): { errors: string[]; warnings: PublishWarning[] } {
    const errors: string[] = [];
    const warnings: PublishWarning[] = [];
    const byId = new Map(version.nodes.map(node => [node.id, node]));
    const keys = new Set<string>();
    for (const node of version.nodes) {
        if (keys.has(node.key)) errors.push(`Duplicate key ${node.key}.`);
        keys.add(node.key);
        if (node.parentId && !byId.has(node.parentId)) errors.push(`${node.key} points at a missing parent.`);
        if (node.nodeType === 'Criterion' && !node.scaleId) errors.push(`${node.key} is a criterion with no scale.`);
        if (node.scaleId && !version.scales.some(scale => scale.id === node.scaleId)) {
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
    for (const node of version.nodes.filter(item => item.nodeType === 'Group')) {
        const children = version.nodes.filter(item => item.parentId === node.id && !item.isAdvisory);
        if (children.length > 0 && children.every(child => child.weight === 0)) {
            warnings.push({ severity: 'warning', message: `Group ${node.key} has only zero-weight children, so they share the score equally.` });
        }
    }
    return { errors, warnings };
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

/** Loads the draft tree and the base version so Save can publish without a separate call. */
export async function LoadDraftForPublish(run: RowRun, versionId: string, rubricId: string, basedOnVersionId: string | null): Promise<{ base: RubricVersionSnapshot | null; draft: RubricVersionSnapshot }> {
    const draft = await loadSnapshot(run, versionId, rubricId);
    const base = basedOnVersionId ? await loadSnapshot(run, basedOnVersionId, rubricId) : null;
    return { base, draft };
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
