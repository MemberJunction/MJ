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
 * **NULL / `{}` / omitted keys = today's behavior.** Every `DisplayInForm`
 * relationship stays a first-class accordion section.
 *
 * Expand by adding a property here — no schema migration.
 *
 * @see plans/form-chrome-policy.md
 */
export interface IEntityRelationshipConfiguration {
    /**
     * Presentation / chrome for this relationship on the parent form.
     * Null = first-class section (today).
     */
    UI?: IEntityRelationshipUIConfiguration;
}

/**
 * How this relationship appears on the parent entity's generated form.
 *
 * Nested under {@link IEntityRelationshipConfiguration.UI} so later UI
 * concerns (group, default-expanded, badge) can sit beside `FormRole`
 * without a migration.
 */
export interface IEntityRelationshipUIConfiguration {
    /**
     * Weight of this relationship in the parent form's chrome.
     *
     * - `'Primary'` — first-class (own accordion, or its own left-nav item).
     * - `'Detail'` — parked in a "More" group (one accordion, or one rail item).
     *
     * Omit to treat as `'Primary'`, which is today's behavior.
     *
     * Field panels already have this idea via `EntityField.GeneratedFormSection`.
     * Do not add a parallel column on `EntityField`.
     */
    FormRole?: 'Primary' | 'Detail';
}
