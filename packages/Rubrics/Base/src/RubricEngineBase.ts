import type { NotApplicablePolicy, RubricBandSnapshot, RubricNodeSnapshot } from './types.js';

export interface RubricCategoryRecord {
    id: string;
    name: string;
    parentId?: string | null;
    description?: string | null;
    sequence: number;
}

export interface RubricScaleLevelRecord {
    id: string;
    label: string;
    value: number;
    normalizedValue: number;
    description?: string | null;
    sequence: number;
}

export interface RubricScaleRecord {
    id: string;
    name: string;
    scaleType: 'Levels' | 'Numeric';
    minValue?: number | null;
    maxValue?: number | null;
    step?: number | null;
    higherIsBetter: boolean;
    levels: RubricScaleLevelRecord[];
}

export interface RubricRecord {
    id: string;
    name: string;
    categoryId?: string | null;
    description?: string | null;
    status: string;
}

/** A version row plus the tree that hangs off it. Status may be Draft; the cache drops those. */
export interface RubricVersionRecord {
    id: string;
    rubricId: string;
    status: string;
    majorVersion?: number | null;
    minorVersion?: number | null;
    patchVersion?: number | null;
    /** Default when a criterion does not set its own. The scorer reads this off the version. */
    notApplicablePolicy: NotApplicablePolicy;
    passThreshold?: number | null;
    minimumCompleteness?: number | null;
    instructions?: string | null;
    scoreDisplayMin: number;
    scoreDisplayMax: number;
    nodes: RubricNodeSnapshot[];
    bands: RubricBandSnapshot[];
}

export interface AgentRubricRecord {
    id: string;
    agentId: string;
    rubricId: string;
    purpose?: string | null;
    isDefault: boolean;
    status: string;
    priority: number;
}

/** Everything the cache holds. The server engine loads rows and passes them here. */
export interface RubricCacheSnapshot {
    categories: RubricCategoryRecord[];
    scales: RubricScaleRecord[];
    rubrics: RubricRecord[];
    versions: RubricVersionRecord[];
    agentRubrics: AgentRubricRecord[];
}

/**
 * A published version plus the criteria, anchors, bands, and scales that score it.
 * The policy, threshold, completeness minimum, instructions, and display range are
 * the version fields RubricScoring reads, so a caller with only this cache can build
 * a RubricVersionSnapshot.
 */
export interface CachedPublishedVersion {
    id: string;
    rubricId: string;
    majorVersion: number;
    minorVersion: number;
    patchVersion: number;
    notApplicablePolicy: NotApplicablePolicy;
    passThreshold: number | null;
    minimumCompleteness: number | null;
    instructions: string | null;
    scoreDisplayMin: number;
    scoreDisplayMax: number;
    nodes: RubricNodeSnapshot[];
    bands: RubricBandSnapshot[];
    scales: RubricScaleRecord[];
}

/**
 * UI-safe cache of rubric definitions. It has no database of its own: the server
 * engine loads rows and calls {@link RubricEngineBase.replaceCache}. Only versions
 * whose status is Published are kept, each with its criteria, level anchors, bands,
 * and the scales those criteria use. Drafts are dropped.
 */
export class RubricEngineBase {
    private categories = new Map<string, RubricCategoryRecord>();
    private scales = new Map<string, RubricScaleRecord>();
    private rubrics = new Map<string, RubricRecord>();
    private published = new Map<string, CachedPublishedVersion>();
    private publishedByRubric = new Map<string, CachedPublishedVersion[]>();
    private agentRubrics = new Map<string, AgentRubricRecord[]>();

    /**
     * Replace the whole cache. Published versions are stored with their tree.
     * A Draft or Retired version is not stored, even when its criteria were loaded.
     */
    public replaceCache(snapshot: RubricCacheSnapshot): void {
        this.categories = new Map(snapshot.categories.map(category => [category.id, category]));
        this.scales = new Map(snapshot.scales.map(scale => [scale.id, scale]));
        this.rubrics = new Map(snapshot.rubrics.map(rubric => [rubric.id, rubric]));
        this.published = new Map();
        this.publishedByRubric = new Map();
        this.agentRubrics = new Map();

        for (const version of snapshot.versions) {
            if (version.status !== 'Published') continue;
            const scaleIds = new Set(version.nodes.map(node => node.scaleId).filter((id): id is string => !!id));
            const cached: CachedPublishedVersion = {
                id: version.id,
                rubricId: version.rubricId,
                majorVersion: version.majorVersion ?? 0,
                minorVersion: version.minorVersion ?? 0,
                patchVersion: version.patchVersion ?? 0,
                notApplicablePolicy: version.notApplicablePolicy,
                passThreshold: version.passThreshold ?? null,
                minimumCompleteness: version.minimumCompleteness ?? null,
                instructions: version.instructions ?? null,
                scoreDisplayMin: version.scoreDisplayMin,
                scoreDisplayMax: version.scoreDisplayMax,
                nodes: version.nodes,
                bands: version.bands,
                scales: [...scaleIds].map(id => this.scales.get(id)).filter((scale): scale is RubricScaleRecord => !!scale),
            };
            this.published.set(cached.id, cached);
            const list = this.publishedByRubric.get(cached.rubricId) ?? [];
            list.push(cached);
            this.publishedByRubric.set(cached.rubricId, list);
        }

        for (const link of snapshot.agentRubrics) {
            const list = this.agentRubrics.get(link.agentId) ?? [];
            list.push(link);
            this.agentRubrics.set(link.agentId, list);
        }
    }

    /** Category by id, or null when it was not in the last snapshot. */
    public getCategory(id: string): RubricCategoryRecord | null {
        return this.categories.get(id) ?? null;
    }

    /** Scale by id, including its levels, or null. */
    public getScale(id: string): RubricScaleRecord | null {
        return this.scales.get(id) ?? null;
    }

    /** Rubric definition by id, or null. */
    public getRubric(id: string): RubricRecord | null {
        return this.rubrics.get(id) ?? null;
    }

    /**
     * A published version with its criteria, anchors, bands, and scales.
     * Returns null for an unknown id and for a draft that was present in the snapshot.
     */
    public getPublishedVersion(versionId: string): CachedPublishedVersion | null {
        return this.published.get(versionId) ?? null;
    }

    /** Every cached published version of one rubric, highest number first. */
    public getPublishedVersions(rubricId: string): CachedPublishedVersion[] {
        const list = this.publishedByRubric.get(rubricId) ?? [];
        return [...list].sort(compareVersionDesc);
    }

    /** The highest published version of a rubric, or null when none is published. */
    public getLatestPublishedVersion(rubricId: string): CachedPublishedVersion | null {
        return this.getPublishedVersions(rubricId)[0] ?? null;
    }

    /** Rubrics linked to an agent, highest priority first. */
    public getAgentRubrics(agentId: string): AgentRubricRecord[] {
        const list = this.agentRubrics.get(agentId) ?? [];
        return [...list].sort((a, b) => b.priority - a.priority);
    }
}

function compareVersionDesc(a: CachedPublishedVersion, b: CachedPublishedVersion): number {
    if (a.majorVersion !== b.majorVersion) return b.majorVersion - a.majorVersion;
    if (a.minorVersion !== b.minorVersion) return b.minorVersion - a.minorVersion;
    return b.patchVersion - a.patchVersion;
}
