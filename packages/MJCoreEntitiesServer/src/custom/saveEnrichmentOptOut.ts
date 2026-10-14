import type { EntitySaveOptions } from '@memberjunction/core';
import { SaveTimeAISettings } from '@memberjunction/ai';
import type { SaveTimeAIKind } from '@memberjunction/ai';

/**
 * A server entity whose save runs AI parameter enrichment and lets one caller opt out for that
 * instance. Implemented by the `MJ: Queries`, `MJ: Query SQLs` and `MJ: Template Contents` server
 * subclasses, so code that sets the flag (the deterministic test factory) is checked against one
 * declaration: renaming the member breaks those callers at compile time instead of silently
 * re-enabling the model call.
 *
 * Three switches turn the enrichment off, and every implementer resolves them with the one rule in
 * {@link SaveEnrichmentOptOut.ShouldSkip}:
 * - the save's own `EntitySaveOptions.SkipEntityAIActions` (that save only);
 * - this instance's {@link SkipAIEnrichment} (sticky across saves);
 * - the host switch (`SaveTimeAISettings` in `@memberjunction/ai`, kind `QueryParameters` or
 *   `TemplateParameters`), which applies to every save the process serves.
 */
export interface ISaveEnrichmentOptOut {
    /**
     * When true, saving this instance skips the AI enrichment stage of parameter extraction; the
     * deterministic extraction still runs. Sticky: it stays set until cleared. Defaults to false.
     * A save whose options carry `SkipEntityAIActions` skips the enrichment for that save even when
     * this is false; the host switch (`SaveTimeAISettings`) skips it for every save.
     */
    SkipAIEnrichment?: boolean;
}

/**
 * The one precedence rule for {@link ISaveEnrichmentOptOut} implementers, so `MJ: Queries`,
 * `MJ: Query SQLs` and `MJ: Template Contents` cannot drift apart on when a save calls the model.
 */
export class SaveEnrichmentOptOut {
    /**
     * The save's own request: `true` when its options carry `SkipEntityAIActions`, otherwise
     * `undefined` (no request). Never `false`: `EntitySaveOptions` defaults `SkipEntityAIActions` to
     * `false` on every save, so `false` means "the caller did not ask", not "enrich" — mapping it to
     * `false` would override a sticky instance `SkipAIEnrichment` on every default save.
     * @param options The options the save was called with.
     */
    public static FromSaveOptions(options: EntitySaveOptions | undefined): true | undefined {
        return options?.SkipEntityAIActions === true ? true : undefined;
    }

    /**
     * The first request that has an answer, in precedence order (highest first), or `undefined` when
     * none does. An explicit `false` is an answer ("enrich this run") and stops the search.
     * @param requests Per-run requests, highest precedence first; `undefined` means "no request".
     */
    public static FirstRequest(...requests: ReadonlyArray<boolean | undefined>): boolean | undefined {
        return requests.find((request) => request !== undefined);
    }

    /**
     * Whether this run skips AI enrichment: the first answered request (see {@link FirstRequest}) is
     * `true`, or the host has switched `kind` off. The host switch wins over an explicit `false`.
     * @param kind The host switch that governs this enrichment.
     * @param requests Per-run requests, highest precedence first — normally
     *   `FromSaveOptions(options)`, then any caller override, then the instance's `SkipAIEnrichment`.
     */
    public static ShouldSkip(kind: SaveTimeAIKind, ...requests: ReadonlyArray<boolean | undefined>): boolean {
        return SaveEnrichmentOptOut.FirstRequest(...requests) === true || SaveTimeAISettings.Instance.IsDisabled(kind);
    }
}
