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
 * `RelatedRolePolicy` ranker decides Primary vs Detail. Explicit
 * `FormRole` always wins.
 *
 * Expand by adding a property here — no schema migration.
 *
 * @see plans/form-chrome-policy.md
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
 * concerns (group, default-expanded, badge) can sit beside `FormRole`
 * without a migration.
 */
export interface IEntityRelationshipUIConfiguration {
    /**
     * Weight of this relationship in the parent form's chrome.
     *
     * - `'Primary'` — always first-class (own accordion / rail item). Punches
     *   through the parent entity's {@link IEntityFormConfiguration.PrimaryRelatedBudget}.
     * - `'Detail'` — always parked in More.
     *
     * Omit to let the parent entity's `RelatedRolePolicy` ranker decide.
     * Default policy is `'smart'` — same-schema children stay top-level;
     * cross-schema hang-ons fold once the budget is exceeded. Not "all More".
     *
     * Field panels already have this idea via `EntityField.GeneratedFormSection`.
     * Do not add a parallel column on `EntityField`.
     */
    FormRole?: 'Primary' | 'Detail';
}
