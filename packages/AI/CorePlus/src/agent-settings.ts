/**
 * @fileoverview The package-side mirror of `Application.AgentSettings` and a tolerant parser for it.
 *
 * `Application.AgentSettings` is a JSONType column: its shape is authored in
 * `metadata/entities/JSONType-interfaces/IAgentSettings.ts` and CodeGen copies that text into the
 * entity layer as the typed `AgentSettingsObject` accessor. That copy is regenerated only when a
 * CodeGen pass runs, so a field added to the interface is invisible to code that reads the
 * generated accessor until then.
 *
 * Runtime code therefore reads the **raw column** through {@link ParseAgentSettings} and this
 * mirror instead — the new field works the moment the code that reads it ships, and a routine
 * `mj sync push` + `mj codegen` later refreshes the generated copy without anything depending on it.
 *
 * **Lockstep contract.** {@link IAgentSettings} is the metadata interface, field for field. Edit
 * both in the same commit; a reviewer should be able to diff the two bodies and see no difference.
 *
 * @module @memberjunction/ai-core-plus
 */

import { IsPlainObject } from '@memberjunction/global';

/**
 * App-scoped agent configuration, stored as JSON in the `AgentSettings` column of `MJ: Applications`.
 * Every field is optional — an app opts into exactly what it needs.
 */
export interface IAgentSettings {
    /** The app's default/lead agent (conversational default AND realtime lead identity). Agent ID. */
    DefaultAgentID?: string | null;

    /**
     * Agents relevant to this app — the static allowed-target set for the co-agent.
     * Union-accumulated at runtime with agent-type defaults and dynamic (channel) registrations.
     */
    RelevantAgents?: Array<{
        /** Agent ID (loop or flow — transparent to the co-agent). */
        AgentID: string;
        /** Optional friendly label for the capability manifest / disclosure ("Skip", "Query Builder"). */
        Label?: string | null;
        /** Per-target disclosure override; falls back to the effective default disclosure. */
        Disclosure?: 'silent' | 'mention' | 'hand-voice' | null;
        /** If true, surfaced in pickers / proactively offered; if false, available but not advertised. */
        Advertised?: boolean | null;
    }>;

    /**
     * App-scoped static client tools, by tool-definition reference.
     * Surfaced to every agent acting in this app and resolved by the unified client-tool resolver.
     */
    ClientTools?: Array<{
        /** References MJ: AI Client Tool Definitions by ID (preferred) or Name. */
        ClientToolDefinitionID?: string | null;
        Name?: string | null;
        /** Optional app-level priority for first-match-wins resolution. */
        Priority?: number | null;
    }>;

    /**
     * Realtime co-agent overrides that layer into the config cascade above the agent's own
     * TypeConfiguration (and below runtime overrides). Only keys set here override; unset keys
     * fall through to the agent / type defaults.
     */
    Realtime?: {
        /** Default delegation disclosure for this app's co-agent. */
        Disclosure?: 'silent' | 'mention' | 'hand-voice' | null;
        /** Persona override folded into the session system prompt at mint. */
        Persona?: {
            Tone?: string | null;
            SpeakingStyle?: string | null;
        } | null;
        /** Model preference override (AI Models Name or ID). */
        ModelPreference?: string | null;
        /**
         * Which interactive realtime channels (Whiteboard, Remote Browser, an Open App's own widget, …)
         * this app's sessions get. Layers into the same per-channel scoping cascade as the agent's own
         * `realtime.channels` configuration (see `@memberjunction/ai-core-plus` `ResolveRealtimeChannelScope`):
         * a layer's `Include` turns a channel on (the only way to get an `opt-in` channel), its `Exclude`
         * turns one off, and the MOST SPECIFIC layer to mention a channel wins; within one layer `Exclude`
         * beats `Include`. A channel's registry row `IsActive = false` remains a master kill switch that
         * nothing here can override. Channel keys match the channel's name, case-insensitively.
         */
        Channels?: {
            /** Channel keys to turn ON (required for `opt-in` channels; a no-op for `all-sessions` ones). */
            Include?: string[] | null;
            /** Channel keys to turn OFF. Beats `Include` within the same layer. */
            Exclude?: string[] | null;
            /** Per-channel opaque configuration, keyed by channel key; delivered to the channel at session start. */
            Config?: { [channelKey: string]: { [key: string]: unknown } } | null;
            /** Per-channel display override, keyed by channel key. */
            DisplayPolicy?: { [channelKey: string]: 'open-on-start' | 'on-demand' | 'headless' } | null;
            /**
             * Exposure levels that need a zero-data-retention model. When the session model's configuration
             * does not declare `Privacy.ZeroDataRetention: true`, exposure is lowered to below the lowest level
             * listed, and the agent is told why. Applies to every channel in the session.
             */
            RequireZeroDataRetentionFor?: Array<'state' | 'pixels'> | null;
        } | null;
    } | null;

    /**
     * Browser Extension configuration for this application — declares URL/DOM entity resolution rules
     * (`ContextRules`), multi-app entity braiding facets (`EntityFacets`), default browser control backend,
     * enterprise debugger ceiling (`AllowDebuggerCDP`), and optional runtime `BrandKitID`.
     */
    BrowserExtension?: {
        /** URL-safe slug for build output directories and extension IDs (e.g. `'mj-copilot'`). */
        BrandSlug?: string | null;
        /** Full extension package name (max 45 chars, e.g. `'MemberJunction Co-Pilot'`). */
        ExtensionName?: string | null;
        /** Short toolbar/launcher name (max 12 chars, e.g. `'MJ Co-Pilot'`). */
        ShortName?: string | null;
        /** Store/package description for the extension. */
        Description?: string | null;
        /** Semantic version string for the extension manifest (e.g. `'6.2.0'`). */
        Version?: string | null;
        /** Assistant persona display name in the Side Panel and Coach-Mark badges (e.g. `'MJ Co-Pilot'`). */
        AssistantDisplayName?: string | null;
        /** Custom label for the primary AI Agent tab in the Side Panel (defaults to `'Agent'`). */
        AgentTabLabel?: string | null;
        /** Header title rendered in the Side Panel chrome (e.g. `'MemberJunction Co-Pilot'`). */
        SidePanelHeaderTitle?: string | null;
        /** Default MemberJunction GraphQL API URL pre-populated in onboarding. */
        DefaultServerUrl?: string | null;
        /** Default OAuth/OIDC provider key (`'msal' | 'auth0' | 'okta' | 'cognito' | 'custom-oidc'`). */
        DefaultAuthProvider?: 'msal' | 'auth0' | 'okta' | 'cognito' | 'custom-oidc' | null;
        /** Optional keyboard shortcut for toggling the Side Panel (e.g. `'Ctrl+Shift+M'`). */
        KeyboardShortcut?: string | null;
        /** Optional Firefox Gecko add-on ID (e.g. `'mj-copilot@memberjunction.org'`). */
        FirefoxExtensionID?: string | null;
        /** Optional macOS/iOS Safari Web Extension bundle identifier (e.g. `'org.memberjunction.copilot.extension'`). */
        SafariBundleIdentifier?: string | null;
        /** Target browsers supported by this brand build (`['chrome', 'edge', 'firefox', 'safari']`). */
        SupportedBrowsers?: Array<'chrome' | 'edge' | 'firefox' | 'safari'> | null;
        /** Default browser control backend for this app (`'content-script'` default, `'debugger-cdp'`, or `'auto'`). */
        DefaultControlBackend?: 'content-script' | 'debugger-cdp' | 'auto' | null;
        /** Enterprise safety ceiling: when `false`, forbids `chrome.debugger` CDP attach and locks to `'content-script'`. */
        AllowDebuggerCDP?: boolean | null;
        /** Optional `MJ: Brand Kits` ID used to dynamically skin the Side Panel and Coach-Mark overlays at runtime. */
        BrandKitID?: string | null;
        /** Optional blocked domain wildcards (e.g. `['*.1password.com', '*.okta.com']`) that force exposure to `'none'`. */
        BlockedDomains?: string[] | null;
        /** Optional host permissions for the extension manifest (defaults to `['<all_urls>']`). */
        HostPermissions?: string[] | null;
        /** Optional externally connectable origin patterns for zero-login MJ web app session handoff. */
        ExternallyConnectableMatches?: string[] | null;
        /** URL & DOM → MJ Entity anchor resolution rules contributed by this application. */
        ContextRules?: Array<{
            /** Unique rule key, e.g. `'common.organization.by-domain'` or `'common.person.linkedin'`. */
            Key: string;
            /** Owning Open App or package name, e.g. `'@mj-biz-apps/common'`. */
            SourceApp: string;
            /** Human-readable rule name. */
            Name: string;
            /** Evaluation priority (lower number = higher priority; sorted deterministically). */
            Priority: number;
            /** Whether this rule is active. */
            IsActive: boolean;
            /** URL inclusion/exclusion patterns for triggering this rule. */
            UrlMatch: {
                /** Glob or regex patterns matching candidate URLs (e.g. LinkedIn profile paths or domain globs). */
                IncludePatterns: string[];
                /** Excluded domain/URL patterns. */
                ExcludePatterns?: string[];
            };
            /** How signals are extracted from the active tab's URL and DOM. */
            Extractor: {
                /** Registered `BaseBrowserPageExtractor` class name (default: `'StandardPageExtractor'`). */
                DriverClass: string;
                /** Optional CSS/XPath/JSON-LD/Meta selectors mapped to logical signal keys. */
                Selectors?: Record<string, {
                    Source: 'url-param' | 'url-regex' | 'hostname-root' | 'meta' | 'json-ld' | 'css-text' | 'css-attr';
                    Expression: string;
                    Attribute?: string;
                }>;
            };
            /** How extracted signals resolve to an MJ Entity record via batched `RunViews()`. */
            EntityResolution: {
                /** Target MJ Entity Name, e.g. `'MJ_BizApps_Common: Organizations'`. */
                EntityName: string;
                /** Parameterized `RunView` ExtraFilter template using `{{signalKey}}` placeholders. */
                FilterTemplate: string;
                /** Optional secondary fallback filter template when primary filter returns 0 rows. */
                FallbackFilterTemplate?: string;
                /** Maximum rows to return (bounded per MJ rule). */
                MaxRows: number;
            };
            /** Optional mapping from extracted signal keys to entity field names for page-to-entity diff & 1-click capture. */
            CandidateFieldMapping?: Record<string, string>;
            /** Optional domain-specific control backend override when this rule matches. */
            PreferredControlBackend?: 'content-script' | 'debugger-cdp' | 'auto';
        }> | null;
        /** Multi-app contextual slices braided onto a resolved anchor entity (`AnchorEntityName`). */
        EntityFacets?: Array<{
            /** Unique facet key, e.g. `'sales.active-deals'` or `'betty.member-status'`. */
            Key: string;
            /** Anchor entity name that triggers this facet, e.g. `'MJ_BizApps_Common: Organizations'`. */
            AnchorEntityName: string;
            /** Owning Open App name (used for badge, icon, and permission scoping). */
            ApplicationName: string;
            /** Display title for the facet card in the Side Panel. */
            Title: string;
            /** Font Awesome icon class for the facet header. */
            IconClass: string;
            /** Display ordering sequence (ascending). */
            Sequence: number;
            /** Batched `RunViews()` query definition referencing `{{AnchorRecordID}}` / `{{AnchorEntityName}}`. */
            Query: {
                EntityName: string;
                FilterTemplate: string;
                OrderBy?: string;
                MaxRows: number;
                Fields?: string[];
            };
            /** How the facet renders in the Side Panel Braided Context Drawer. */
            Surface: {
                Renderer: 'entity-cards' | 'metric-summary' | 'component-spec';
                ComponentArtifactID?: string;
                EmptyStateBehavior: 'hide' | 'show-quick-create';
            };
            /** Contextual Quick Actions / Agent Prompts surfaced in this facet. */
            QuickActions?: Array<{
                Label: string;
                IconClass: string;
                Kind: 'agent-prompt' | 'remote-operation' | 'open-in-explorer' | 'create-related-record';
                Target: string;
                ParamsTemplate?: Record<string, string>;
            }>;
        }> | null;
        /** Optional custom system-prompt instructions injected into `AppContextSnapshot` for the Browser Extension AI Agent. */
        AgentPromptInstructions?: string | null;
        /** Guided cross-site playbooks contributed by this application (`MJExtensionPlaybookStepperComponent`). */
        Playbooks?: Array<{
            /** Unique playbook identifier (e.g. `'crm.hubspot-oauth-setup'`). */
            Id: string;
            /** Display name of the playbook. */
            Name: string;
            /** Short summary of what the playbook guides the user through. */
            Description: string;
            /** Optional starting URL for launching the playbook. */
            StartUrl?: string;
            /** Optional URL glob/substring patterns where this playbook is contextually prioritized. */
            UrlPatterns?: string[];
            /** Optional preferred browser control backend (`'content-script' | 'debugger-cdp' | 'auto'`). */
            PreferredBackend?: 'content-script' | 'debugger-cdp' | 'auto';
            /** Ordered steps in the guided playbook. */
            Steps: Array<{
                StepId: string;
                Title: string;
                Instruction: string;
                Kind:
                    | 'Navigate'
                    | 'HighlightElement'
                    | 'WaitForUserAction'
                    | 'ClickElement'
                    | 'FillInput'
                    | 'CopySecretToMJVault';
                NavigateUrl?: string;
                TargetSelector?: string;
                InputValue?: string;
                CalloutPosition?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
                WaitForActionKind?: 'click' | 'input' | 'submit' | 'navigation';
                ExpectedUrlPattern?: string;
                RequireTrustedInput?: boolean;
                RequiresConfirmationGate?: boolean;
                VaultCredentialName?: string;
                VaultTargetFieldName?: string;
            }>;
        }> | null;
    } | null;
}

/**
 * Tolerantly parses the raw `AgentSettings` column.
 *
 * Returns `null` — never throws — for an absent, blank, malformed or non-object payload, because an
 * app with no usable settings is simply an app with no app layer. Members of the right *container*
 * type are passed through untouched (this is a typed view of stored JSON, not a validator): the
 * consumers that interpret a member (`NormalizeRealtimeChannelsConfig`, the client-tool resolver)
 * each re-validate what they read, so a hand-edited column degrades per-field instead of per-app.
 *
 * Arrays-valued members that arrive as a different type are dropped rather than coerced, so
 * `settings.ClientTools` is always either absent or an array.
 *
 * @param json The raw column value (a JSON string), or `null`/`undefined`.
 * @returns The parsed settings, or `null` when there are none.
 */
export function ParseAgentSettings(json: string | null | undefined): IAgentSettings | null {
    if (typeof json !== 'string' || json.trim().length === 0) {
        return null;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return null;
    }
    if (!IsPlainObject(parsed)) {
        return null;
    }
    const settings: IAgentSettings = { ...(parsed as IAgentSettings) };
    if (settings.RelevantAgents !== undefined && !Array.isArray(settings.RelevantAgents)) {
        delete settings.RelevantAgents;
    }
    if (settings.ClientTools !== undefined && !Array.isArray(settings.ClientTools)) {
        delete settings.ClientTools;
    }
    if (settings.Realtime !== undefined && settings.Realtime !== null && !IsPlainObject(settings.Realtime)) {
        delete settings.Realtime;
    }
    if (settings.BrowserExtension !== undefined && settings.BrowserExtension !== null) {
        if (!IsPlainObject(settings.BrowserExtension)) {
            delete settings.BrowserExtension;
        } else {
            const ext = { ...settings.BrowserExtension };
            if (ext.ContextRules !== undefined && ext.ContextRules !== null && !Array.isArray(ext.ContextRules)) {
                delete ext.ContextRules;
            }
            if (ext.EntityFacets !== undefined && ext.EntityFacets !== null && !Array.isArray(ext.EntityFacets)) {
                delete ext.EntityFacets;
            }
            if (ext.BlockedDomains !== undefined && ext.BlockedDomains !== null && !Array.isArray(ext.BlockedDomains)) {
                delete ext.BlockedDomains;
            }
            if (ext.Playbooks !== undefined && ext.Playbooks !== null && !Array.isArray(ext.Playbooks)) {
                delete ext.Playbooks;
            }
            settings.BrowserExtension = ext;
        }
    }
    return settings;
}
