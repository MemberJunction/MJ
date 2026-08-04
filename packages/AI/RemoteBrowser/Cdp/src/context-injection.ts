/**
 * @fileoverview **Model-blind context injection** for goal-driven browser runs. Secrets (and any other
 * sensitive values) are passed to {@link import('./cdp-remote-browser-session').CdpRemoteBrowserSession.RunComputerUseGoal}
 * in a `Context` object and referenced **by label** — e.g. the goal says "log in using `{{creds.username}}`
 * / `{{creds.password}}`". The controller (vision/action) model only ever emits those `{{label}}` tokens;
 * the real value is substituted **here, at the action-execution boundary**, immediately before the
 * keystrokes reach CDP. Neither the realtime model nor the computer-use controller ever holds the value.
 *
 * Redaction falls out for free: the engine records the controller's emitted action (still containing the
 * `{{label}}`) in its step history *before* the adapter runs; {@link resolveActionTemplates} returns a
 * **clone** with the value injected, leaving the recorded action — and thus all logs/transcripts —
 * model-safe.
 *
 * This mirrors the MJ agents context-variable pattern (`resolveValueFromContext` / `getValueFromPath` in
 * `@memberjunction/ai-agents`), re-implemented minimally here so the CDP package needs no agents dependency.
 *
 * @module @memberjunction/remote-browser-cdp
 */

import { BaseBrowserAdapter, type BrowserAction } from '@memberjunction/computer-use';

/** Matches a `{{ path.to.value }}` template token (dotted + array-index paths). */
const TEMPLATE_TOKEN = /\{\{\s*([\w.[\]]+)\s*\}\}/g;

/**
 * Resolves a dotted / array-indexed path against a context object (e.g. `'creds.password'`,
 * `'items[0].id'`). Returns `undefined` for any missing segment.
 *
 * @param obj The context object.
 * @param path The dotted path.
 * @returns The value at the path, or `undefined`.
 */
export function getValueFromPath(obj: unknown, path: string): unknown {
    if (obj == null || !path) {
        return undefined;
    }
    let current: unknown = obj;
    for (const part of path.split('.')) {
        if (current == null) {
            return undefined;
        }
        const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
        if (arrayMatch) {
            const [, name, idx] = arrayMatch;
            const arr = (current as Record<string, unknown>)[name];
            if (!Array.isArray(arr)) {
                return undefined;
            }
            current = arr[Number(idx)];
        } else {
            current = (current as Record<string, unknown>)[part];
        }
    }
    return current;
}

/**
 * Substitutes every `{{path}}` token in a string with its resolved context value. Unresolved tokens are
 * left intact (rather than emitting `'undefined'`), surfacing a clear authoring error.
 *
 * @param value The string that may contain `{{path}}` tokens.
 * @param context The context object values resolve against.
 * @returns The resolved string.
 */
export function resolveTemplateString(value: string, context: Record<string, unknown>): string {
    if (!value || value.indexOf('{{') === -1) {
        return value;
    }
    return value.replace(TEMPLATE_TOKEN, (match, path: string) => {
        const resolved = getValueFromPath(context, path);
        return resolved == null ? match : String(resolved);
    });
}

/**
 * Returns a clone of a {@link BrowserAction} with its text/URL fields resolved against the context. The
 * ORIGINAL action is never mutated (so the engine's recorded step keeps the `{{label}}` — model-safe). The
 * clone preserves the action's prototype so adapter `instanceof` checks still hold.
 *
 * @param action The action the controller emitted (may contain `{{label}}` tokens).
 * @param context The context object values resolve against.
 * @returns A resolved clone (or the original when there is nothing to resolve).
 */
export function resolveActionTemplates(action: BrowserAction, context: Record<string, unknown>): BrowserAction {
    const a = action as BrowserAction & { Text?: string; Url?: string };
    const needsText = typeof a.Text === 'string' && a.Text.indexOf('{{') !== -1;
    const needsUrl = typeof a.Url === 'string' && a.Url.indexOf('{{') !== -1;
    if (!needsText && !needsUrl) {
        return action;
    }
    const clone = Object.assign(Object.create(Object.getPrototypeOf(action)), action) as typeof a;
    if (needsText) {
        clone.Text = resolveTemplateString(a.Text as string, context);
    }
    if (needsUrl) {
        clone.Url = resolveTemplateString(a.Url as string, context);
    }
    return clone as BrowserAction;
}

/**
 * Wraps a {@link BaseBrowserAdapter} so every {@link BaseBrowserAdapter.ExecuteAction} call has its
 * `{{label}}` tokens resolved against `context` first (via {@link resolveActionTemplates}). Every other
 * method/getter delegates unchanged to the inner adapter. Returns a transparent proxy — the engine drives
 * it exactly like a real adapter, but only the resolved value ever reaches CDP.
 *
 * @param inner The live, CDP-attached adapter.
 * @param context The model-blind context object.
 * @returns A proxy adapter that injects context values at the action boundary.
 */
export function wrapAdapterWithContext(inner: BaseBrowserAdapter, context: Record<string, unknown>): BaseBrowserAdapter {
    return new Proxy(inner, {
        get(target, prop) {
            if (prop === 'ExecuteAction') {
                return (action: BrowserAction) => target.ExecuteAction(resolveActionTemplates(action, context));
            }
            // Bind methods to the real target and read getters with the target as receiver, so the inner
            // adapter's private state is accessed correctly through the proxy.
            const value = Reflect.get(target, prop, target);
            return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
        },
    });
}
