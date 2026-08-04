import { GetGlobalObjectStore } from '../util';

/**
 * A pluggable transform handler: `(value, fields, config) => result`. Same call shape as the built-in
 * transforms, so a plugin is indistinguishable from a built-in at the call site.
 */
export type FieldTransformPlugin = (value: unknown, fields: Record<string, unknown>, config: unknown) => unknown;

/** Global-object-store key so registrations survive bundlers that duplicate this module. */
const STORE_KEY = '__mj_FieldTransformPlugins__';

function registry(): Map<string, FieldTransformPlugin> {
    const store = (GetGlobalObjectStore() ?? (globalThis as unknown as Record<string, unknown>)) as Record<string, unknown>;
    let map = store[STORE_KEY] as Map<string, FieldTransformPlugin> | undefined;
    if (!map) {
        map = new Map<string, FieldTransformPlugin>();
        store[STORE_KEY] = map;
    }
    return map;
}

/**
 * Registers a transform plugin by type name so the {@link FieldTransformEngine} can dispatch a
 * non-built-in transform to it.
 *
 * This is how heavier transforms (e.g. `jsonpath`, `xpath`) are added WITHOUT making their libraries
 * (jsonpath-plus, xpath, @xmldom/xmldom, …) dependencies of this foundational package: a separate
 * package owns the libs, implements the handler, and calls this at module-load to register it. Any
 * `FieldTransformEngine` in the process (integration sync, rules-based bulk update, …) then supports the
 * transform — the engine stays lib-free, the plugin owns the deps. Idempotent per type (last wins).
 *
 * @param type - The transform `Type` string (case-insensitive), e.g. `'jsonpath'`.
 * @param plugin - The handler.
 */
export function RegisterFieldTransform(type: string, plugin: FieldTransformPlugin): void {
    registry().set(type.trim().toLowerCase(), plugin);
}

/** Returns the registered plugin for a transform type, or `undefined` if none is registered. */
export function GetFieldTransform(type: string): FieldTransformPlugin | undefined {
    return registry().get(type.trim().toLowerCase());
}
