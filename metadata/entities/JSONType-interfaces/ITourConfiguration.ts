/**
 * Tour-level configuration and localization overrides stored on `MJ: Tours.Configuration`.
 *
 * This file is the JSONType source. EntityField.JSONTypeDefinition stores it
 * verbatim, and CodeGen emits it inline, so it cannot import another file.
 */

/** Locale-specific display overrides for a tour. */
export interface ITourLocalization {
    /** Localized tour title. */
    name?: string;
    /** Localized tour summary description. */
    description?: string;
}

/** Tour.Configuration — localizations and extensible tour-level UI/runtime options. */
export interface ITourConfiguration {
    /** Locale-keyed overrides (BCP 47 tags such as `'es'`, `'fr-CA'`). */
    localizations?: Record<string, ITourLocalization>;
    /** Whether the Back button is available during visual playback (default true). */
    allowBack?: boolean;
    /** Whether step progress ("2 of 5") is displayed (default true). */
    showProgress?: boolean;
    /** Whether the user can dismiss the tour mid-flight (default true). */
    showDismiss?: boolean;
    /** Whether the "Ask Sage about this step" action is displayed on steps. */
    showAskAgent?: boolean;
    /** Presenter-specific options passed to `BaseTourPresenter` (Overlay, SidePanel, Embedded, or custom). */
    presenterOptions?: Record<string, unknown>;
    /** CSS custom-property token overrides applied to this tour's Light DOM root. */
    themeOverrides?: Record<string, string>;
    /** Extensible tour-level settings for custom drivers or presenters. */
    [key: string]: unknown;
}
