/**
 * @fileoverview Pure helpers for the Credentials dashboard's AI-agent integration.
 *
 * 🚨 SAFETY BOUNDARY — METADATA-ONLY, NEVER SECRET VALUES 🚨
 * The Credentials dashboard is a SECURITY-SENSITIVE surface. These helpers shape
 * the component's current NON-SENSITIVE state (active tab, aggregate counts,
 * loading flag, and bounded *definition* names — credential TYPE names and
 * CATEGORY names) into the key-value context object that flows to the async chat
 * agent and the realtime co-agent via `NavigationService.SetAgentContext`. They
 * are intentionally free of Angular / component dependencies so the resulting
 * context shape can be unit-tested in isolation — including an explicit assertion
 * that no secret-like key (secret / password / token / key value / credential
 * value) can ever appear.
 *
 * What flows out: ActiveTab, TabLabel, aggregate counts (credentials / types /
 * categories / active / expiring), IsLoading, and bounded credential-TYPE names +
 * CATEGORY names (these are reusable *definitions* — e.g. "OAuth 2.0",
 * "API Key" — NOT individual credential records, and NEVER a secret value).
 * What NEVER flows out: a credential's secret value, an API key, a password, a
 * token, a connection string, an individual credential's NAME (which could hint
 * at a specific system), or any other reveal-able credential material. Those
 * values never enter this helper's input, so they cannot leak through its output.
 */

import { boundNameList } from '../shared/agent-tool-validation';

/** Standard tolerant result shape for the Credentials client-tool resolvers. */
export interface CredentialsResolveResult<T> {
    ok: boolean;
    value?: T;
    errorMessage?: string;
}

/** The five tabs the Credentials dashboard exposes. */
export const VALID_CREDENTIALS_TABS = ['overview', 'credentials', 'types', 'categories', 'audit'] as const;

/** Union of the valid Credentials tab ids. */
export type CredentialsTab = (typeof VALID_CREDENTIALS_TABS)[number];

/**
 * Type-guard / validator for a Credentials tab string. Keeps the
 * `SwitchCredentialsTab` client tool tolerant of arbitrary agent input — only the
 * five known tab ids are accepted.
 *
 * @param tab - candidate tab string (may be anything the agent passes)
 * @returns true when `tab` is one of overview | credentials | types | categories | audit
 */
export function isValidCredentialsTab(tab: unknown): tab is CredentialsTab {
    return typeof tab === 'string' && (VALID_CREDENTIALS_TABS as readonly string[]).includes(tab);
}

/**
 * The plain, component-supplied snapshot used to build the agent context. By
 * construction this contains ONLY non-sensitive navigation/metadata + definition
 * names — there is no field here for a credential secret, password, token, key
 * value, or even an individual credential's name, so none can be published.
 */
export interface CredentialsAgentContextInput {
    /** The currently active tab id (overview/credentials/types/categories/audit). */
    ActiveTab: CredentialsTab;
    /** Human-readable label for the active tab. */
    TabLabel: string;
    /** Count of active credentials (a count only — never the credentials themselves). */
    CredentialCount: number;
    /** Count of credential types defined. */
    TypeCount: number;
    /** Count of credential categories defined. */
    CategoryCount: number;
    /** Count of credentials expiring soon (count only). */
    ExpiringSoonCount: number;
    /** Whether the dashboard is currently loading. */
    IsLoading: boolean;
    /**
     * Credential-TYPE names (reusable definitions — e.g. "OAuth 2.0", "API Key").
     * Safe: these are schema definitions, not credential records or secrets.
     */
    TypeNames: readonly string[];
    /** Credential CATEGORY names (organizational definitions). */
    CategoryNames: readonly string[];
}

/**
 * Build the agent-visible context object for the Credentials dashboard.
 *
 * Returns a flat key-value object of NON-SENSITIVE metadata only: active tab, its
 * label, aggregate counts, the loading flag, and BOUNDED credential-type +
 * category definition names (capped via {@link boundNameList} with a companion
 * truncation flag). Keeping this a pure function (no `this`) makes the context
 * shape unit-testable and lets the test assert that no secret-bearing key can
 * ever appear.
 *
 * @param input - the component's current non-sensitive state snapshot
 * @returns a flat key-value object suitable for `SetAgentContext`
 */
export function buildCredentialsAgentContext(input: CredentialsAgentContextInput): Record<string, unknown> {
    const typeNames = boundNameList(input.TypeNames);
    const categoryNames = boundNameList(input.CategoryNames);

    return {
        ActiveTab: input.ActiveTab,
        TabLabel: input.TabLabel,
        CredentialCount: input.CredentialCount,
        TypeCount: input.TypeCount,
        CategoryCount: input.CategoryCount,
        ExpiringSoonCount: input.ExpiringSoonCount,
        IsLoading: input.IsLoading,
        TypeNames: typeNames,
        TypeNamesTruncated: typeNames.length < input.TypeNames.length,
        CategoryNames: categoryNames,
        CategoryNamesTruncated: categoryNames.length < input.CategoryNames.length,
    };
}
