/**
 * AUTO-COPIED FROM metadata/entities/JSONType-interfaces/IEntityConfiguration.ts
 * DO NOT EDIT DIRECTLY. Run `pnpm run build` in MJCore to refresh.
 */

/**
 * Optional per-entity configuration bag.
 *
 * Stored as JSON in `MJ: Entities.Configuration`. CodeGen emits a typed
 * `ConfigurationObject` accessor on `MJEntityEntity` that returns
 * `IEntityConfiguration | null`.
 *
 * **NULL / `{}` / omitted keys** use the defaults on
 * {@link IEntityFormConfiguration} (`Layout: auto`, `RelatedRolePolicy: smart`).
 * Membership itself is L1 inclusion + L2 ranker + L3 `MJ: Form Chrome Rules`
 * + L4 user order. `BaseFormPolicy.DecorateChrome` is cosmetics only.
 *
 * Expand by adding a property here — no schema migration. Anything the engine
 * filters, sorts, or joins on stays a **column** on `Entity`. Anything the UI
 * consumes at render time belongs in this bag.
 *
 * @see guides/FORMS_ARCHITECTURE_GUIDE.md §7d
 */
export interface IEntityConfiguration {
    /**
     * Presentation / chrome. Null = host defaults (`Layout: auto`,
     * `RelatedRolePolicy: smart`).
     */
    UI?: IEntityUIConfiguration;
}

/**
 * Entity-level presentation configuration.
 *
 * Nested under {@link IEntityConfiguration.UI} so later UI concerns (list
 * cards, search chrome, map defaults) can sit beside `Form` without a
 * migration.
 */
export interface IEntityUIConfiguration {
    /**
     * How the generated record form arranges its sections.
     * Null = inherit {@link IEntityFormConfiguration} defaults.
     */
    Form?: IEntityFormConfiguration;
}

/**
 * Generated-form chrome for this entity (L2 defaults).
 *
 * Consumed by `<mj-record-form-container>`. L1 `inclusion` and L3
 * `MJ: Form Chrome Rules` decide membership; this bag only ranks Auto
 * leftovers and chooses accordion vs left-nav.
 */
export interface IEntityFormConfiguration {
    /**
     * Layout chrome for the generated form.
     *
     * - `'accordion'` — every first-class section is a collapsible panel.
     * - `'left-nav'` — a left rail of section groups; the body shows one group.
     * - `'auto'` — accordion until the first-class section count reaches
     *   {@link AutoLeftNavAt}, then left-nav.
     *
     * Omit to treat as `'auto'`.
     */
    Layout?: 'accordion' | 'left-nav' | 'auto';

    /**
     * Section-count threshold used when {@link Layout} is `'auto'` (or omitted).
     * Defaults to 8. Ignored for an explicit `'accordion'` or `'left-nav'`.
     */
    AutoLeftNavAt?: number;

    /**
     * How Auto (omitted inclusion) relationships are resolved.
     *
     * - `'keep-all-primary'` — every remaining Auto related stays first-class.
     * - `'smart'` — budgeted ranker: same-schema 1:N / collections / custom
     *   display components stay top-level; cross-schema hang-ons and platform
     *   plumbing fold into More once the Auto pool exceeds
     *   {@link PrimaryRelatedBudget}.
     *
     * Omit to treat as `'smart'`.
     */
    RelatedRolePolicy?: 'keep-all-primary' | 'smart';

    /**
     * Max Auto related grids that stay first-class when
     * {@link RelatedRolePolicy} is `'smart'`. Default 6. Explicit
     * `inclusion: 'Primary'` is never capped by this number.
     */
    PrimaryRelatedBudget?: number;
}
