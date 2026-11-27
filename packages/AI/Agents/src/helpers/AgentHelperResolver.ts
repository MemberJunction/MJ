/**
 * @fileoverview Centralized resolution and per-run caching of pluggable `BaseAgent*Helper`
 * instances via `MJGlobal.Instance.ClassFactory`.
 *
 * Resolution precedence:
 * 1. Per-agent `helperPlugins` entry (`driverClass`, admin-only; **FORBIDDEN** for code-only
 *    security seams listed in {@link CODE_ONLY_HELPER_SEAMS}).
 * 2. Global `@RegisterClass(BaseHelper)` registration (highest priority wins).
 * 3. Direct instantiation of `DefaultCtor` fallback (safeguard when tests clear `ClassFactory`).
 *
 * @module @memberjunction/ai-agents
 */

import {
    IsForbiddenMetadataHelperSeam,
    ParseAgentHelperPlugins,
    type AgentHelperPluginEntry,
    type MJAIAgentEntityExtended,
} from '@memberjunction/ai-core-plus';
import { type EffectiveAgentProperties } from '@memberjunction/ai-engine-base';
import { AIEngine } from '@memberjunction/aiengine';
import { MJGlobal } from '@memberjunction/global';
import {
    CODE_ONLY_HELPER_SEAMS,
    type AgentHelperPluginConfig,
    type AgentHelperSeamKey,
} from './base-agent-types';

/**
 * Constructor type for a zero-arg pluggable helper class.
 */
export type AgentHelperConstructor<T> = new () => T;

/**
 * Input options for {@link ResolveAgentHelper}.
 */
export interface ResolveAgentHelperOptions<TBase> {
    /** Seam key identifying the helper domain (checked against {@link CODE_ONLY_HELPER_SEAMS}). */
    SeamKey: AgentHelperSeamKey;
    /** Pluggable base token class registered with `@RegisterClass(BaseClass, ...)`. */
    BaseClass: AgentHelperConstructor<TBase>;
    /** Default implementation constructor used if `ClassFactory` has no registration loaded. */
    DefaultClass: AgentHelperConstructor<TBase>;
    /** Optional per-agent plugin `driverClass` override from `AIAgent.Configuration.helperPlugins`. */
    DriverClass?: string | null;
}

/** Default registration key used by built-in `Agent*Helper` implementations (avoids ClassFactory null-key warnings). */
export const DEFAULT_AGENT_HELPER_KEY = 'Default';

/**
 * Resolves a helper instance for the requested seam via `MJGlobal.Instance.ClassFactory`.
 *
 * Enforces the hard security invariant that code-only seams (`limits`, `actionPolicy`)
 * can **never** be replaced via metadata `DriverClass` configuration.
 *
 * Resolution order when `DriverClass` is omitted:
 * 1. Global unkeyed `@RegisterClass(BaseClass)` override (if registered by a consumer).
 * 2. Highest-priority `@RegisterClass(BaseClass, 'Default')` registration (built-in default or downstream override).
 * 3. Direct instantiation of `DefaultClass` fallback (safeguard when tests clear `ClassFactory`).
 */
export function ResolveAgentHelper<TBase>(options: ResolveAgentHelperOptions<TBase>): TBase {
    const trimmedDriver = options.DriverClass?.trim();
    if (trimmedDriver && trimmedDriver.length > 0) {
        if (CODE_ONLY_HELPER_SEAMS.has(options.SeamKey) || IsForbiddenMetadataHelperSeam(options.SeamKey)) {
            throw new Error(
                `Security violation: helper seam '${options.SeamKey}' is code-only and cannot be overridden ` +
                `via agent metadata helperPlugins (requested driverClass '${trimmedDriver}'). ` +
                `Use @RegisterClass in server code instead.`
            );
        }
        const keyed = MJGlobal.Instance.ClassFactory.TryCreateInstance<TBase>(options.BaseClass, trimmedDriver);
        if (keyed.Resolved && keyed.Instance) {
            return keyed.Instance;
        }
        throw new Error(
            `Failed to resolve helper plugin '${trimmedDriver}' for seam '${options.SeamKey}': ` +
            (keyed.Reason ?? 'no matching @RegisterClass registration found')
        );
    }

    const factory = MJGlobal.Instance.ClassFactory;
    const defaultKeyLower = DEFAULT_AGENT_HELPER_KEY.toLowerCase();
    // Only consider truly unkeyed global overrides or explicit 'Default' registrations —
    // never let a keyed per-agent plugin (e.g. 'AcmePayloadHelper') bleed into unrelated agents.
    const globalRegs = factory
        .GetAllRegistrations(options.BaseClass)
        .filter((reg) => {
            const key = reg.Key?.trim().toLowerCase() ?? '';
            return key === '' || key === defaultKeyLower;
        });

    if (globalRegs.length > 0) {
        let best = globalRegs[0];
        for (let i = 1; i < globalRegs.length; i++) {
            // Highest priority wins; on ties, later registration wins (matches ClassFactory semantics).
            if (globalRegs[i].Priority >= best.Priority) {
                best = globalRegs[i];
            }
        }
        const SubClassCtor = best.SubClass as AgentHelperConstructor<TBase>;
        return new SubClassCtor();
    }

    return new options.DefaultClass();
}

/**
 * Per-`BaseAgent` instance helper cache. Cleared at the start of each `Execute()` run so
 * per-agent `helperPlugins` and newly registered `@RegisterClass` overrides take effect cleanly.
 */
export class AgentHelperCache {
    private readonly _instances = new Map<AgentHelperSeamKey, object>();
    private _pluginsBySeam = new Map<AgentHelperSeamKey, string>();

    /**
     * Resets cached helper instances and applies optional per-agent plugin bindings for a new run.
     */
    public ResetForRun(plugins?: ReadonlyArray<AgentHelperPluginConfig | AgentHelperPluginEntry>): void {
        this._instances.clear();
        this._pluginsBySeam.clear();
        if (!plugins || plugins.length === 0) {
            return;
        }
        // Sort ascending by priority so higher-priority entries win in the map.
        const sorted = [...plugins].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
        for (const plugin of sorted) {
            const seamKey = plugin.seam.trim();
            if (CODE_ONLY_HELPER_SEAMS.has(seamKey as AgentHelperSeamKey) || IsForbiddenMetadataHelperSeam(seamKey)) {
                throw new Error(
                    `Security violation: helper seam '${plugin.seam}' is code-only and cannot be configured ` +
                    `in agent helperPlugins (driverClass '${plugin.driverClass}').`
                );
            }
            if (plugin.driverClass?.trim()) {
                this._pluginsBySeam.set(seamKey as AgentHelperSeamKey, plugin.driverClass.trim());
            }
        }
    }

    /**
     * Returns the cached helper for `options.SeamKey`, resolving it lazily via
     * {@link ResolveAgentHelper} on first access.
     */
    public GetOrResolve<TBase extends object>(options: Omit<ResolveAgentHelperOptions<TBase>, 'DriverClass'>): TBase {
        const existing = this._instances.get(options.SeamKey);
        if (existing) {
            return existing as TBase;
        }
        const driverClass = this._pluginsBySeam.get(options.SeamKey);
        const resolved = ResolveAgentHelper<TBase>({
            ...options,
            DriverClass: driverClass,
        });
        this._instances.set(options.SeamKey, resolved);
        return resolved;
    }
}

/**
 * Safely resolves cascaded `EffectiveAgentProperties` for `agent` via `AIEngine.Instance`
 * (`Agent -> BaseAgent Chain -> Category -> Parent Categories -> AgentType -> System Default`),
 * returning `null` cleanly when `AIEngine` is uninitialized in isolated unit tests.
 */
export function SafeResolveEffectiveAgentProperties(
    agent: MJAIAgentEntityExtended | null | undefined
): EffectiveAgentProperties | null {
    if (!agent) {
        return null;
    }
    try {
        if (typeof AIEngine.Instance?.ResolveEffectiveAgentProperties === 'function') {
            return AIEngine.Instance.ResolveEffectiveAgentProperties(agent);
        }
    } catch {
        // Uninitialized engine in isolated unit tests; callers fall back to direct agent fields.
    }
    return null;
}

/**
 * Resolves the ordered per-run `helperPlugins` list combining cascaded metadata bindings
 * (`AgentType -> Categories -> BaseAgent chain -> Agent`) with optional programmatic overrides.
 */
export function ResolveAgentHelperPluginsForRun(
    agent: MJAIAgentEntityExtended | null | undefined,
    runtimePlugins?: ReadonlyArray<AgentHelperPluginConfig | AgentHelperPluginEntry>
): Array<AgentHelperPluginConfig | AgentHelperPluginEntry> {
    const effective = SafeResolveEffectiveAgentProperties(agent);
    const cascaded = effective?.HelperPlugins ?? [];
    const metadataPlugins: AgentHelperPluginEntry[] =
        cascaded.length > 0
            ? cascaded
            : [
                  ...ParseAgentHelperPlugins(agent?.Configuration),
                  ...ParseAgentHelperPlugins(agent?.TypeConfiguration),
              ];
    return [...metadataPlugins, ...(runtimePlugins ?? [])];
}
