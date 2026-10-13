/**
 * A server entity whose save runs AI parameter enrichment and lets one caller opt out for that
 * instance. Implemented by the `MJ: Queries`, `MJ: Query SQLs` and `MJ: Template Contents` server
 * subclasses, so code that sets the flag (the deterministic test factory) is checked against one
 * declaration: renaming the member breaks those callers at compile time instead of silently
 * re-enabling the model call.
 */
export interface ISaveEnrichmentOptOut {
    /**
     * When true, saving this instance skips the AI enrichment stage of parameter extraction; the
     * deterministic extraction still runs. Sticky: it stays set until cleared. Defaults to false.
     * The host can switch the same enrichment off for every save (`SaveTimeAISettings` in `@memberjunction/ai`).
     */
    SkipAIEnrichment?: boolean;
}
