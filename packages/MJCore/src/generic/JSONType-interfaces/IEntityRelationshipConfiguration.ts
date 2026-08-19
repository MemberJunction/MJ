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
