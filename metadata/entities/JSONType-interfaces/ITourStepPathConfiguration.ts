/**
 * Branch edge configuration and localization overrides stored on `MJ: Tour Step Paths.Configuration`.
 *
 * This file is the JSONType source. EntityField.JSONTypeDefinition stores it
 * verbatim, and CodeGen emits it inline, so it cannot import another file.
 */

/** Locale-specific display overrides for a branch edge. */
export interface ITourStepPathLocalization {
    /** Localized branch edge label. */
    label?: string;
}

/** TourStepPath.Configuration — localizations and extensible edge metadata. */
export interface ITourStepPathConfiguration {
    /** Locale-keyed overrides (BCP 47 tags such as `'es'`, `'fr-CA'`). */
    localizations?: Record<string, ITourStepPathLocalization>;
    /** Choice option key matched when originating from a `Choice` step. */
    choiceKey?: string;
    /** Marks this branch as optional in graph evaluation. */
    isOptional?: boolean;
    /** Extensible edge settings for custom `BaseTourDriver` routing. */
    [key: string]: unknown;
}
