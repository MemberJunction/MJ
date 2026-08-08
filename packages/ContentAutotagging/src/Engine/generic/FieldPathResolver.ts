import { BaseEngineRegistry, BaseEntity, EntityInfo, IMetadataProvider, IRunViewProvider, LogError, UserInfo } from '@memberjunction/core';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';

/**
 * Resolves per-record values for field paths rooted at a batch of records — the generic
 * machinery behind provider-declared source-record dependencies (see
 * `VectorDBBase.GetSourceRecordFieldPaths`), usable for any config that needs a value living
 * on a related record.
 *
 * Two path forms are supported:
 * - **Plain field** (`"OrganizationID"`): the value is read directly off the record's own
 *   field set.
 * - **Single-hop path** (`"ContentSourceID.OrganizationID"`): the first segment names a
 *   foreign-key field on the root entity; the second names a field on the related entity. The
 *   related record is loaded and — when the related entity is an IS-A parent type — its
 *   child-type rows (shared primary key) are loaded and merged over it, so a field that
 *   physically lives on an IS-A extension entity (e.g. `myschema.ContentSource.OrganizationID`)
 *   resolves without the configuration ever naming the child entity.
 *
 * Only single-valued FK hops are traversed (never 1:N relationships) and path depth is capped
 * at one hop, which keeps resolution O(distinct FK values) per pass. Deeper paths are a
 * configuration error: they log and resolve nothing, which callers treat per their own policy.
 *
 * Resolution is lazy and batched: callers create one resolver per pass and call
 * {@link ResolveForItems} per record batch. Distinct FK values are loaded with a single
 * `IN (...)` query per entity (base + each IS-A child) and cached for the resolver's lifetime,
 * so a related record referenced by ten thousand rows is loaded once per pass.
 */
export class FieldPathResolver {
    /** Merged related-record cache for this pass, keyed by normalized FK value. `null` = load attempted and failed/missing. */
    private recordCache = new Map<string, Record<string, unknown> | null>();

    constructor(
        private provider: IMetadataProvider,
        private contextUser: UserInfo,
        /** Entity whose records the paths are rooted at (e.g. 'MJ: Content Items'). */
        private rootEntityName: string
    ) {}

    /**
     * Resolve the path value for each record. Accepts any BaseEntity batch whose entity matches
     * the resolver's root entity. Returns a map keyed by the record's normalized primary-key
     * value; a missing/null entry means the value could not be resolved for that record —
     * callers decide what that means (one unresolvable record never poisons the rest).
     */
    public async ResolveForItems(
        items: BaseEntity[],
        fieldPath: string
    ): Promise<Map<string, unknown>> {
        const result = new Map<string, unknown>();
        if (items.length === 0) return result;

        const segments = fieldPath.split('.').map(s => s.trim());
        if (segments.length === 1 && segments[0].length > 0) {
            for (const item of items) {
                const all = item.GetAll() as Record<string, unknown>;
                result.set(this.recordKey(item), this.readField(all, segments[0]));
            }
            return result;
        }

        if (segments.length !== 2 || segments.some(s => s.length === 0)) {
            LogError(`FieldPathResolver: unsupported field path "${fieldPath}" — only a plain field name or a single-hop "<FKField>.<Field>" path is supported`);
            return result;
        }

        const [fkFieldName, targetFieldName] = segments;
        const targetEntity = this.resolveTargetEntity(fkFieldName, fieldPath);
        if (!targetEntity) return result;

        // Batch-load the distinct related records this batch actually references (cache-aware).
        const fkValueByItem = new Map<string, string>();
        for (const item of items) {
            const all = item.GetAll() as Record<string, unknown>;
            const fkValue = this.readField(all, fkFieldName);
            if (fkValue != null && String(fkValue).trim().length > 0) {
                fkValueByItem.set(this.recordKey(item), String(fkValue));
            }
        }
        await this.loadRelatedRecords(targetEntity, [...new Set(fkValueByItem.values())]);

        for (const item of items) {
            const fkValue = fkValueByItem.get(this.recordKey(item));
            const related = fkValue ? this.recordCache.get(this.cacheKey(fkValue)) : undefined;
            result.set(this.recordKey(item), related ? this.readField(related, targetFieldName) : undefined);
        }
        return result;
    }

    /** The result-map key for a root record: its (first) primary-key value, normalized. */
    private recordKey(item: BaseEntity): string {
        return NormalizeUUID(String(item.FirstPrimaryKey.Value));
    }

    /**
     * Validate the FK segment against the root entity's metadata and resolve the entity it points
     * at. Logs and returns null on any misconfiguration (unknown field, not a foreign key, target
     * entity missing) so callers see the paths as unresolvable.
     */
    private resolveTargetEntity(fkFieldName: string, fieldPath: string): EntityInfo | null {
        const rootEntity = this.provider.EntityByName(this.rootEntityName);
        if (!rootEntity) {
            LogError(`FieldPathResolver: root entity "${this.rootEntityName}" not found in metadata`);
            return null;
        }
        const fkField = rootEntity.Fields.find(f => f.Name.trim().toLowerCase() === fkFieldName.toLowerCase());
        if (!fkField) {
            LogError(`FieldPathResolver: field path "${fieldPath}" — field "${fkFieldName}" does not exist on "${this.rootEntityName}"`);
            return null;
        }
        if (!fkField.RelatedEntityID) {
            LogError(`FieldPathResolver: field path "${fieldPath}" — field "${fkFieldName}" is not a foreign key, cannot traverse`);
            return null;
        }
        const target = this.provider.Entities.find(e => UUIDsEqual(e.ID, fkField.RelatedEntityID));
        if (!target) {
            LogError(`FieldPathResolver: related entity ${fkField.RelatedEntityID} for "${fkFieldName}" not found in metadata`);
            return null;
        }
        return target;
    }

    /**
     * Load the given related records into the cache: one `IN (...)` query against the target
     * entity, plus one per IS-A child entity (shared PK), merging child fields over the parent's
     * so IS-A extension fields resolve transparently. Values already cached are skipped. A failed
     * load caches `null` for the affected keys so items referencing them resolve to undefined
     * rather than retrying within the pass.
     */
    private async loadRelatedRecords(targetEntity: EntityInfo, fkValues: string[]): Promise<void> {
        const toLoad = fkValues.filter(v => !this.recordCache.has(this.cacheKey(v)));
        if (toLoad.length === 0) return;

        const baseRows = await this.loadRowsByPK(targetEntity, toLoad);
        if (baseRows === null) {
            for (const v of toLoad) this.recordCache.set(this.cacheKey(v), null);
            return;
        }

        const merged = new Map<string, Record<string, unknown>>();
        const pkName = targetEntity.FirstPrimaryKey.Name;
        for (const row of baseRows) {
            const pk = this.readField(row, pkName);
            if (pk != null) merged.set(this.cacheKey(String(pk)), { ...row });
        }

        // IS-A downcast: merge each child-type row (shared PK) over its parent record. Children
        // are merged in metadata order; with disjoint subtypes at most one child row exists per
        // record, so ordering only matters for (rare) overlapping-subtype field collisions.
        for (const child of targetEntity.ChildEntities) {
            const childRows = await this.loadRowsByPK(child, toLoad);
            if (childRows === null) continue; // child load failure degrades to parent fields only
            const childPKName = child.FirstPrimaryKey.Name;
            for (const row of childRows) {
                const pk = this.readField(row, childPKName);
                if (pk == null) continue;
                const existing = merged.get(this.cacheKey(String(pk)));
                if (existing) Object.assign(existing, row);
            }
        }

        for (const v of toLoad) {
            this.recordCache.set(this.cacheKey(v), merged.get(this.cacheKey(v)) ?? null);
        }
    }

    /**
     * Load rows for a set of PK values. Per MJ convention, a loaded engine's full-set cache is
     * consulted first (BaseEngineRegistry) — e.g. ContentSources are already cached by
     * KnowledgeHubMetadataEngine, so the common hop resolves with zero queries. Falls back to one
     * `PK IN (...)` RunView. Returns null (not []) on query failure.
     */
    private async loadRowsByPK(entity: EntityInfo, pkValues: string[]): Promise<Record<string, unknown>[] | null> {
        if (pkValues.length === 0) return [];

        const cached = this.readRowsFromRegistryCache(entity, pkValues);
        if (cached !== null) return cached;

        const pkName = entity.FirstPrimaryKey.Name;
        const idList = pkValues.map(v => `'${v.replace(/'/g, "''")}'`).join(',');
        const rv = this.provider as unknown as IRunViewProvider;
        const result = await rv.RunView<Record<string, unknown>>({
            EntityName: entity.Name,
            ExtraFilter: `${pkName} IN (${idList})`,
            ResultType: 'simple'
        }, this.contextUser);
        if (!result.Success) {
            LogError(`FieldPathResolver: failed to load "${entity.Name}" records for path resolution: ${result.ErrorMessage}`);
            return null;
        }
        return result.Results;
    }

    /**
     * Serve the requested rows from an already-loaded engine's full-set cache when one exists
     * (read-only — the donor's live array is never mutated). Returns null when no engine caches
     * the entity or the cached rows aren't entity objects, so the caller queries instead.
     */
    private readRowsFromRegistryCache(entity: EntityInfo, pkValues: string[]): Record<string, unknown>[] | null {
        const rows = BaseEngineRegistry.Instance.TryGetCachedRecords(entity.Name, { unfilteredOnly: true });
        if (!rows) return null;
        if (rows.length > 0 && typeof (rows[0] as Partial<BaseEntity>).GetAll !== 'function') return null;

        const wanted = new Set(pkValues.map(v => this.cacheKey(v)));
        return rows
            .filter(r => wanted.has(this.cacheKey(String(r.FirstPrimaryKey.Value))))
            .map(r => r.GetAll() as Record<string, unknown>);
    }

    /** Read a field from a plain record: exact name first, then case-insensitive fallback. */
    private readField(record: Record<string, unknown>, fieldName: string): unknown {
        if (fieldName in record) return record[fieldName];
        const lower = fieldName.toLowerCase();
        const key = Object.keys(record).find(k => k.toLowerCase() === lower);
        return key !== undefined ? record[key] : undefined;
    }

    /** Normalized cache key for an FK value (UUIDs compare case-insensitively in MJ). */
    private cacheKey(value: string): string {
        return NormalizeUUID(value.trim());
    }
}
