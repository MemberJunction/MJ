/**
 * Learning path configuration and localization overrides stored on `MJ: Tour Learning Paths.Configuration`.
 *
 * This file is the JSONType source. EntityField.JSONTypeDefinition stores it
 * verbatim, and CodeGen emits it inline, so it cannot import another file.
 */

/** Locale-specific display overrides for a learning path. */
export interface ILearningPathLocalization {
    /** Localized learning path title. */
    name?: string;
    /** Localized learning path description. */
    description?: string;
}

/** TourLearningPath.Configuration — localizations and checklist presentation options. */
export interface ILearningPathConfiguration {
    /** Locale-keyed overrides (BCP 47 tags such as `'es'`, `'fr-CA'`). */
    localizations?: Record<string, ILearningPathLocalization>;
    /** Font Awesome icon class displayed on the learning-path checklist card. */
    icon?: string;
    /** Whether this learning path renders on the Explorer Home checklist card. */
    showOnHome?: boolean;
    /** Whether this learning path appears inside the Tours & Help launcher. */
    showInLauncher?: boolean;
    /** When true, tours must be completed in `TourLearningPathTourLink.Sequence` order. */
    enforceOrder?: boolean;
    /** Optional badge label awarded upon completing all required tours in the path. */
    completionBadge?: string;
    /** Extensible learning-path settings. */
    [key: string]: unknown;
}
