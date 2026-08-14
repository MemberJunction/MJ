/**
 * Optional per-entity configuration bag.
 *
 * Stored as JSON in `MJ: Entities.Configuration`. CodeGen emits a typed
 * `ConfigurationObject` accessor on `MJEntityEntity` that returns
 * `IEntityConfiguration | null`.
 *
 * **NULL / `{}` / omitted keys = today's behavior.** Nothing is required of any
 * application. Apps that want last-wins chrome or cancelable section events
 * still register an optional `BaseFormPolicy`; this bag is only the
 * tenant-editable default the container reads when no policy overrides it.
 *
 * Expand by adding a property here — no schema migration. Anything the engine
 * filters, sorts, or joins on stays a **column** on `Entity`. Anything the UI
 * or a policy consumes at render time belongs in this bag.
 *
 * @see plans/form-chrome-policy.md
 */
export interface IEntityConfiguration {
    /**
     * Presentation / chrome. Null = host defaults (accordion, every
     * `DisplayInForm` relationship is first-class).
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
 * Generated-form chrome for this entity.
 *
 * Consumed by `<mj-record-form-container>` (and by a winning
 * `BaseFormPolicy.ResolveChrome`, which may ignore these defaults).
 */
export interface IEntityFormConfiguration {
    /**
     * Layout chrome for the generated form.
     *
     * - `'accordion'` — every first-class section is a collapsible panel (today).
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
}
