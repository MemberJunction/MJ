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
        if (CODE_ONLY_HELPER_SEAMS.has(options.SeamKey)) {
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
    const unkeyedReg = factory.GetRegistration(options.BaseClass, undefined);
    const defaultReg = factory.GetRegistration(options.BaseClass, DEFAULT_AGENT_HELPER_KEY);
    if (unkeyedReg && (!defaultReg || unkeyedReg.Priority >= defaultReg.Priority)) {
        const unkeyed = factory.TryCreateInstance<TBase>(options.BaseClass);
        if (unkeyed.Resolved && unkeyed.Instance) {
            return unkeyed.Instance;
        }
    }

    const defaultResult = factory.TryCreateInstance<TBase>(options.BaseClass, DEFAULT_AGENT_HELPER_KEY);
    if (defaultResult.Resolved && defaultResult.Instance) {
        return defaultResult.Instance;
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
    public ResetForRun(plugins?: ReadonlyArray<AgentHelperPluginConfig>): void {
        this._instances.clear();
        this._pluginsBySeam.clear();
        if (!plugins || plugins.length === 0) {
            return;
        }
        // Sort ascending by priority so higher-priority entries win in the map.
        const sorted = [...plugins].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
        for (const plugin of sorted) {
            if (CODE_ONLY_HELPER_SEAMS.has(plugin.seam)) {
                throw new Error(
                    `Security violation: helper seam '${plugin.seam}' is code-only and cannot be configured ` +
                    `in agent helperPlugins (driverClass '${plugin.driverClass}').`
                );
            }
            if (plugin.driverClass?.trim()) {
                this._pluginsBySeam.set(plugin.seam, plugin.driverClass.trim());
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
