import { BaseEngine, type BaseEnginePropertyConfig, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { SnapshotFromRows } from './snapshot.js';
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

/** Entities {@link RubricEngineBase.Config} keeps fresh. */
export const RUBRIC_CACHE_ENTITIES = [
    'MJ: Rubric Categories',
    'MJ: Rubric Scales',
    'MJ: Rubric Scale Levels',
    'MJ: Rubrics',
    'MJ: Rubric Versions',
    'MJ: Rubric Criteria',
    'MJ: Rubric Criterion Levels',
    'MJ: Rubric Bands',
    'MJ: AI Agent Rubrics',
] as const;

/**
 * Cache of rubric definitions. It is a {@link BaseEngine}, so a metadata provider
 * can refresh it. Only versions whose status is Published are kept, each with its
 * criteria, level anchors, bands, and the scales those criteria use. Drafts are dropped.
 * Callers can still replace the shaped cache directly.
 */
@RegisterClass(BaseEngine, 'RubricEngineBase')
export class RubricEngineBase extends BaseEngine<RubricEngineBase> {
    public static get Instance(): RubricEngineBase {
        return super.getInstance<RubricEngineBase>();
    }

    public constructor() {
        super();
    }

    /**
     * Loads the rubric entities, then rebuilds the published-version maps the
     * readers use. A metadata refresh is not visible until that rebuild.
     */
    public async Config(forceRefresh?: boolean, contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        const configs: Partial<BaseEnginePropertyConfig>[] = RUBRIC_CACHE_ENTITIES.map(entityName => ({
            Type: 'entity',
            EntityName: entityName,
            PropertyName: propertyName(entityName),
            CacheLocal: true,
        }));
        await this.Load(configs, provider, forceRefresh, contextUser);
        this.ReplaceCache(ShapedCacheFromRows({
            categories: this.loaded('MJ: Rubric Categories'),
            scales: this.loaded('MJ: Rubric Scales'),
            levels: this.loaded('MJ: Rubric Scale Levels'),
            rubrics: this.loaded('MJ: Rubrics'),
            versions: this.loaded('MJ: Rubric Versions'),
            criteria: this.loaded('MJ: Rubric Criteria'),
            anchors: this.loaded('MJ: Rubric Criterion Levels'),
            bands: this.loaded('MJ: Rubric Bands'),
            agentRubrics: this.loaded('MJ: AI Agent Rubrics'),
        }));
    }

    private loaded(entityName: string): unknown[] {
        const value = (this as unknown as Record<string, unknown>)[propertyName(entityName)];
        return Array.isArray(value) ? value : [];
    }
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
    public ReplaceCache(snapshot: RubricCacheSnapshot): void {
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

    /** @deprecated Use {@link ReplaceCache}. */
    public replaceCache(snapshot: RubricCacheSnapshot): void {
        return this.ReplaceCache(snapshot);
    }

    /** Category by id, or null when it was not in the last snapshot. */
    public GetCategory(id: string): RubricCategoryRecord | null {
        return this.categories.get(id) ?? null;
    }

    /** @deprecated Use {@link GetCategory}. */
    public getCategory(id: string): RubricCategoryRecord | null {
        return this.GetCategory(id);
    }

    /** Scale by id, including its levels, or null. */
    public GetScale(id: string): RubricScaleRecord | null {
        return this.scales.get(id) ?? null;
    }

    /** @deprecated Use {@link GetScale}. */
    public getScale(id: string): RubricScaleRecord | null {
        return this.GetScale(id);
    }

    /** Rubric definition by id, or null. */
    public GetRubric(id: string): RubricRecord | null {
        return this.rubrics.get(id) ?? null;
    }

    /** @deprecated Use {@link GetRubric}. */
    public getRubric(id: string): RubricRecord | null {
        return this.GetRubric(id);
    }

    /**
     * A published version with its criteria, anchors, bands, and scales.
     * Returns null for an unknown id and for a draft that was present in the snapshot.
     */
    public GetPublishedVersion(versionId: string): CachedPublishedVersion | null {
        return this.published.get(versionId) ?? null;
    }

    /** @deprecated Use {@link GetPublishedVersion}. */
    public getPublishedVersion(versionId: string): CachedPublishedVersion | null {
        return this.GetPublishedVersion(versionId);
    }

    /** Every cached published version of one rubric, highest number first. */
    public GetPublishedVersions(rubricId: string): CachedPublishedVersion[] {
        const list = this.publishedByRubric.get(rubricId) ?? [];
        return [...list].sort(compareVersionDesc);
    }

    /** @deprecated Use {@link GetPublishedVersions}. */
    public getPublishedVersions(rubricId: string): CachedPublishedVersion[] {
        return this.GetPublishedVersions(rubricId);
    }

    /** The highest published version of a rubric, or null when none is published. */
    public GetLatestPublishedVersion(rubricId: string): CachedPublishedVersion | null {
        return this.GetPublishedVersions(rubricId)[0] ?? null;
    }

    /** @deprecated Use {@link GetLatestPublishedVersion}. */
    public getLatestPublishedVersion(rubricId: string): CachedPublishedVersion | null {
        return this.GetLatestPublishedVersion(rubricId);
    }

    /** Rubrics linked to an agent, highest priority first. */
    public GetAgentRubrics(agentId: string): AgentRubricRecord[] {
        const list = this.agentRubrics.get(agentId) ?? [];
        return [...list].sort((a, b) => b.priority - a.priority);
    }

    /** @deprecated Use {@link GetAgentRubrics}. */
    public getAgentRubrics(agentId: string): AgentRubricRecord[] {
        return this.GetAgentRubrics(agentId);
    }
}

function compareVersionDesc(a: CachedPublishedVersion, b: CachedPublishedVersion): number {
    if (a.majorVersion !== b.majorVersion) return b.majorVersion - a.majorVersion;
    if (a.minorVersion !== b.minorVersion) return b.minorVersion - a.minorVersion;
    return b.patchVersion - a.patchVersion;
}

function propertyName(entityName: string): string {
    return `_${entityName.replace(/[^A-Za-z0-9]/g, '')}`;
}

/** Builds the shaped cache from the entity rows {@link RubricEngineBase.Config} just loaded. */
export function ShapedCacheFromRows(loaded: {
    categories: unknown[];
    scales: unknown[];
    levels: unknown[];
    rubrics: unknown[];
    versions: unknown[];
    criteria: unknown[];
    anchors: unknown[];
    bands: unknown[];
    agentRubrics: unknown[];
}): RubricCacheSnapshot {
    const scales: RubricScaleRecord[] = loaded.scales.map(scale => {
        const id = text(cell(scale, 'ID'));
        return {
            id,
            name: text(cell(scale, 'Name')),
            scaleType: cell(scale, 'ScaleType') === 'Numeric' ? 'Numeric' : 'Levels',
            minValue: numberOrNull(cell(scale, 'MinValue')),
            maxValue: numberOrNull(cell(scale, 'MaxValue')),
            step: numberOrNull(cell(scale, 'Step')),
            higherIsBetter: cell(scale, 'HigherIsBetter') == null ? true : bit(cell(scale, 'HigherIsBetter')),
            levels: loaded.levels.filter(level => text(cell(level, 'ScaleID')) === id).map(level => ({
                id: text(cell(level, 'ID')),
                label: text(cell(level, 'Label')),
                value: numberOrZero(cell(level, 'Value')),
                normalizedValue: numberOrZero(cell(level, 'NormalizedValue')),
                description: text(cell(level, 'Description')) || null,
                sequence: numberOrZero(cell(level, 'Sequence')),
            })),
        };
    });
    const versions: RubricVersionRecord[] = loaded.versions.map(version => {
        const id = text(cell(version, 'ID'));
        const rubricId = text(cell(version, 'RubricID'));
        const criteria = loaded.criteria.filter(row => text(cell(row, 'RubricVersionID')) === id);
        const criterionIds = new Set(criteria.map(row => text(cell(row, 'ID'))));
        const scaleIds = criteria.map(row => text(cell(row, 'ScaleID'))).filter(scaleId => scaleId.length > 0);
        const tree = SnapshotFromRows({
            version,
            rubricId,
            criteria,
            anchors: loaded.anchors.filter(row => criterionIds.has(text(cell(row, 'CriterionID')))),
            bands: loaded.bands.filter(row => text(cell(row, 'RubricVersionID')) === id),
            scales: loaded.scales.filter(row => scaleIds.includes(text(cell(row, 'ID')))),
            levels: loaded.levels.filter(row => scaleIds.includes(text(cell(row, 'ScaleID')))),
        });
        return {
            id,
            rubricId,
            status: text(cell(version, 'Status')),
            majorVersion: numberOrNull(cell(version, 'MajorVersion')),
            minorVersion: numberOrNull(cell(version, 'MinorVersion')),
            patchVersion: numberOrNull(cell(version, 'PatchVersion')),
            notApplicablePolicy: (text(cell(version, 'NotApplicablePolicy')) || 'ExcludeAndRedistribute') as RubricVersionRecord['notApplicablePolicy'],
            passThreshold: numberOrNull(cell(version, 'PassThreshold')),
            minimumCompleteness: numberOrNull(cell(version, 'MinimumCompleteness')),
            instructions: text(cell(version, 'Instructions')) || null,
            scoreDisplayMin: numberOrZero(cell(version, 'ScoreDisplayMin')),
            scoreDisplayMax: cell(version, 'ScoreDisplayMax') == null ? 100 : numberOrZero(cell(version, 'ScoreDisplayMax')),
            nodes: tree.nodes,
            bands: tree.bands,
        };
    });
    return {
        categories: loaded.categories.map(row => ({
            id: text(cell(row, 'ID')),
            name: text(cell(row, 'Name')),
            parentId: text(cell(row, 'ParentID')) || null,
            description: text(cell(row, 'Description')) || null,
            sequence: numberOrZero(cell(row, 'Sequence')),
        })),
        scales,
        rubrics: loaded.rubrics.map(row => ({
            id: text(cell(row, 'ID')),
            name: text(cell(row, 'Name')),
            categoryId: text(cell(row, 'CategoryID')) || null,
            description: text(cell(row, 'Description')) || null,
            status: text(cell(row, 'Status')),
        })),
        versions,
        agentRubrics: loaded.agentRubrics.map(row => ({
            id: text(cell(row, 'ID')),
            agentId: text(cell(row, 'AgentID')),
            rubricId: text(cell(row, 'RubricID')),
            purpose: text(cell(row, 'Purpose')) || null,
            isDefault: bit(cell(row, 'IsDefault')),
            status: text(cell(row, 'Status')),
            priority: numberOrZero(cell(row, 'Priority')),
        })),
    };
}

function cell(row: unknown, name: string): unknown {
    const record = row as { Get?: (fieldName: string) => unknown } & Record<string, unknown>;
    if (record && record[name] === undefined && typeof record.Get === 'function') return record.Get(name);
    return record?.[name];
}

function text(value: unknown): string {
    return value == null ? '' : String(value);
}

function numberOrZero(value: unknown): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function numberOrNull(value: unknown): number | null {
    if (value == null || value === '') return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function bit(value: unknown): boolean {
    return value === true || value === 1 || value === '1';
}
