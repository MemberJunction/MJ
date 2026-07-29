/**
 * @fileoverview Lightweight Nunjucks renderer for scope configuration values.
 *
 * `SearchScope*` tables store template strings (MetadataFilter, ExtraFilter,
 * UserSearchString, FolderPath) that embed `SearchContext` variables — for example:
 *
 *     `OrganizationID='{{ context.PrimaryScopeRecordID }}' AND DepartmentID='{{ context.SecondaryScopes.dept.value }}'`
 *
 * This module renders those strings with a minimal, pre-configured Nunjucks environment
 * so the SearchEngine does not have to bootstrap the full `@memberjunction/templates`
 * engine (which is intended for stored, managed templates, not ad-hoc config values).
 *
 * For stored template resolution (e.g., `AIAgentSearchScope.QueryTemplateID`,
 * `SearchScopeProvider.QueryTransformTemplateID`) use `@memberjunction/templates` with
 * `TemplateEngineServer` — that path runs in Phase 1C (AgentPreExecutionRAG) where we
 * already have a stored-template workflow.
 *
 * @module @memberjunction/search-engine
 */

import nunjucks from 'nunjucks';
import { EscapeScopeValueDeep, type ScopeLaneKind } from './ScopeValueEscaper';
import { LogError } from '@memberjunction/core';
import { SearchContext } from './search.types';

/** Environment used for all ad-hoc scope template rendering. */
const env = new nunjucks.Environment(null as unknown as nunjucks.ILoader, {
    autoescape: false, // values go into filters / metadata, not HTML
    throwOnUndefined: false,
    trimBlocks: true,
    lstripBlocks: true
});

// Add the same JSON-oriented filters exposed by @memberjunction/templates so scope
// authors can use familiar helpers (`{{ foo | json }}`, `{{ raw | jsonparse }}`) when
// composing MetadataFilter strings.
env.addFilter('json', (value: unknown, indent: number = 2): string => {
    if (value === undefined || value === null) return '';
    try {
        return JSON.stringify(value, null, indent);
    } catch {
        return String(value);
    }
});

env.addFilter('jsoninline', (value: unknown): string => {
    if (value === undefined || value === null) return '';
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
});

env.addFilter('jsonparse', (value: unknown): unknown => {
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
});

/**
 * Render a scope template string with the supplied SearchContext. Returns the original
 * string unchanged when `template` is null/empty. Returns the original string on render
 * failure (logged via LogError) so a single bad template does not bring down a search.
 */
export function RenderScopeTemplate(
    template: string | null | undefined,
    context: SearchContext | undefined,
    extraData?: Record<string, unknown>,
    /**
     * The dialect this template renders into (§5.4). Every interpolated context value is escaped
     * for it automatically, so an author never has to remember.
     *
     * Defaults to `'none'` rather than to a guess: this function also renders NON-filter fields
     * (`UserSearchString`, query transforms) where the value becomes search text, and escaping
     * those would corrupt the query rather than protect it. Filter call sites pass their real kind.
     */
    laneKind: ScopeLaneKind = 'none'
): string {
    if (!template) return '';
    if (!template.includes('{{') && !template.includes('{%')) {
        // No templating syntax — skip the renderer entirely
        return template;
    }

    // `context` is escaped for the lane; `contextRaw` is the untouched original. Deliberate raw
    // insertion is therefore spelled `{{ contextRaw.X }}` — one grep finds every such site, which
    // is the point. A post-escape `| raw` filter could not do this: by the time a filter runs the
    // original value is already gone.
    const data: Record<string, unknown> = {
        context: EscapeScopeValueDeep(context ?? {}, laneKind) as Record<string, unknown>,
        contextRaw: context ?? {},
        // extraData is escaped too. It previously spread in un-escaped, which meant the one exported
        // function whose entire job is escaping had a silent bypass sitting in its signature. No
        // in-repo caller passes it today, so this was latent rather than live — but leaving an
        // unescaped channel in a security primitive is how a future caller introduces an injection
        // without touching this file or noticing anything.
        ...(EscapeScopeValueDeep(extraData ?? {}, laneKind) as Record<string, unknown>)
    };

    try {
        return env.renderString(template, data);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        LogError(`SearchEngine: Scope template render failed — returning raw template. Error: ${msg}. Template: ${template.substring(0, 200)}`);
        return template;
    }
}

/**
 * Render and parse a JSON-valued scope template (used for `MetadataFilter` values).
 * Returns:
 *   - `undefined` when the template is null/empty
 *   - parsed object when render output is valid JSON
 *   - the raw rendered string when it is non-empty but not JSON (provider can decide what to do)
 *   - `undefined` when render fails outright
 */
export function RenderScopeJsonTemplate(
    template: string | null | undefined,
    context: SearchContext | undefined,
    extraData?: Record<string, unknown>,
    laneKind: ScopeLaneKind = 'json'
): unknown {
    if (!template) return undefined;
    const rendered = RenderScopeTemplate(template, context, extraData, laneKind);
    const trimmed = rendered.trim();
    if (!trimmed) return undefined;
    try {
        return JSON.parse(trimmed);
    } catch {
        // Return the raw rendered string — providers can still interpret
        return trimmed;
    }
}
