/**
 * AUTO-COPIED FROM metadata/entities/JSONType-interfaces/IEntityRelationshipConfiguration.ts
 * DO NOT EDIT DIRECTLY. Run `pnpm run build` in MJCore to refresh.
 */

/**
 * Optional per-relationship configuration bag.
 *
 * Stored as JSON in `MJ: Entity Relationships.Configuration`. CodeGen emits a
 * typed `ConfigurationObject` accessor on `MJEntityRelationshipEntity` that
 * returns `IEntityRelationshipConfiguration | null`.
 *
 * Distinct from the other JSON columns on the same row, which CodeGen already
 * owns for other jobs:
 *
 * - `RelatedRecordCollection` — `IRelatedRecordCollectionConfig` (composite graphs)
 * - `DisplayComponentConfiguration` — knobs for the selected display component
 * - `AdditionalFieldsToInclude` — join-field name list
 *
 * **NULL / `{}` / omitted keys = Auto.** The parent entity's
 * `RelatedRolePolicy` ranker decides Primary vs More. Explicit
 * `inclusion` (or the `FormRole` alias) always wins.
 * `inclusion: 'None'` removes the relationship from the parent form
 * entirely — it is not a More item and the ranker never sees it.
 *
 * Expand by adding a property here — no schema migration.
 *
 * @see guides/FORMS_ARCHITECTURE_GUIDE.md §7d
 */
export interface IEntityRelationshipConfiguration {
    /**
     * Presentation / chrome for this relationship on the parent form.
     * Null = the parent entity's related-role ranker decides.
     */
    UI?: IEntityRelationshipUIConfiguration;

    /**
     * Clone policy for rows of RelatedEntity that point at this entity through RelatedEntityJoinField.
     * @see plans/record-cloning/README.md §4.2
     */
    Clone?: ICloneRelationshipPolicy;
}

/**
 * How this relationship appears on the parent entity's generated form.
 *
 * Nested under {@link IEntityRelationshipConfiguration.UI} so later UI
 * concerns (group, default-expanded, badge) can sit beside `inclusion`
 * without a migration.
 */
export interface IEntityRelationshipUIConfiguration {
    /**
     * L1 inclusion on the parent form. Keyed conceptually by
     * (parent, related entity), not by a single FK.
     *
     * - `'Primary'` — first-class rail.
     * - `'More'` — candidate, parked in More.
     * - `'None'` — not a candidate. Not in More. Ranker never sees it.
     *
     * Omit = Auto (L2 ranker). See [Forms Architecture §7d](../../../../guides/FORMS_ARCHITECTURE_GUIDE.md).
     */
    inclusion?: 'Primary' | 'More' | 'None';

    /**
     * Alias of {@link inclusion}. `'Primary'` maps to Primary,
     * `'Detail'` maps to More.
     */
    FormRole?: 'Primary' | 'Detail';

    /**
     * Same-table OR of FKs for one parent-form section
     * (Bill-To OR Ship-To Orders). Sibling ERs to the same related entity
     * should be `inclusion: 'None'` so they do not sprout extra rail items.
     */
    join?: {
        mode: 'any';
        fields: string[];
    };

    /**
     * Higher = earlier among first-class related rail items (after Details,
     * after lead contributions such as Overview). Omit = 0.
     */
    sortKey?: number;
}

/**
 * Clone policy for rows of RelatedEntity that point at this entity through RelatedEntityJoinField.
 * @see plans/record-cloning/README.md §4.2
 */
export interface ICloneRelationshipPolicy {
    Policy?: 'Deep' | 'Reference' | 'Skip';
    /** UI may not change it. */
    Locked?: boolean;
    MaxRecords?: number;
    /** Write the source's positional values after the last Add instead of letting the collection renumber. Default false. */
    PreserveSequence?: boolean;
    /** Formula over the child row (fields.X); only rows evaluating true are cloned. */
    IncludeWhen?: string;
    Fields?: ICloneFieldRules;
}

export interface ICloneFieldRules {
    /** Never copied; take the column default. Beyond the always-excluded set (PK, __mj_*, identity, computed, virtual, denied-create). */
    Exclude?: string[];
    /** Literal stamps applied after the copy. Values pass through BaseEntity.Set and validation. */
    Reset?: Record<string, unknown>;
    /** Set to the cloning user's ID. */
    Ownership?: string[];
    /** The user must supply a value; un-suffixable uniques such as Email. Missing → plan Blocked. */
    PromptFor?: string[];
    /** Server-minted values (numbers, slugs): blanked so the entity's Save hook allocates. */
    ServerAllocated?: string[];
    /** Rich rewrites. Evaluated per row with the source row as fields, plus clone context (user, now, root, keyMap) — see §7.5. */
    Rules?: Record<string, unknown>;
    /** JSON columns that embed record IDs. */
    JsonRemap?: Record<string, IJsonRemapSpec[]>;
    /** Columns that must be cleared together (all-or-nothing CHECK pairs). Each group is cleared as a unit when any member is reset. */
    ClearTogether?: string[][];
    /** Unique keys the metadata cannot see: composite and filtered indexes. See §7.3. */
    UniqueKeys?: Array<{ Fields: string[]; Scope: 'Global' | 'Parent' | 'LiveState'; ScopeField?: string }>;
    /** Drift guard (§13.3): every field must appear in Copy, Exclude, Reset, Ownership, PromptFor, ServerAllocated or JsonRemap, or validation fails. Default false. */
    Strict?: boolean;
    /** Explicit copy allow-list, used with Strict. */
    Copy?: string[];
}

export interface IJsonRemapSpec {
    /** Path selector: dot segments and [*] for arrays, e.g. 'layout.content[*].componentState.config.viewId'. */
    Path: string;
    /** remap = rewrite via key map when the target is in the clone set, else per OnMissing; reuse = leave; regenerate = new UUID; null = set null; drop = remove element/key. */
    Mode: 'remap' | 'reuse' | 'regenerate' | 'null' | 'drop';
    /** Entity the ID refers to, for remap. */
    Entity?: string;
    /** For remap when the referenced record was not cloned: reuse the original (default) or drop the element and count it. */
    OnMissing?: 'reuse' | 'drop';
}

