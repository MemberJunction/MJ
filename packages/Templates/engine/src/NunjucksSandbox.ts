/**
 * @fileoverview Guards the nunjucks runtime so templates cannot run JavaScript or reach server objects.
 *
 * nunjucks has no sandbox mode. Every compiled template resolves bare names, member access and calls
 * through three functions on nunjucks' shared runtime module: `contextOrFrameLookup`, `memberLookup`
 * and `callWrap`. Unguarded, a template can walk from any value to `Function`
 * (`range.constructor("...")()`) and run code on the server, or call `valueOf()` to get the render
 * context and change the shared environment.
 *
 * {@link HardenNunjucksRuntime} wraps those three functions in place. The runtime module is shared by
 * every nunjucks environment in the process, so the guard covers all of them, including templates
 * loaded through `include` and `import`.
 * @module @memberjunction/templates
 */
import nunjucks from 'nunjucks';

/** The parts of a nunjucks render context the guard reads. */
interface NunjucksRenderContext {
    env: { globals: object };
    getVariables(): object;
}

/** The part of a nunjucks frame (template-local scope) the guard reads. */
interface NunjucksFrame {
    lookup(name: string): unknown;
}

/**
 * The runtime functions every compiled template calls. Member names match nunjucks' runtime module.
 * Template values are arbitrary data, so they are typed `unknown`.
 */
interface NunjucksRuntimeHooks {
    memberLookup: (obj: unknown, val: unknown) => unknown;
    contextOrFrameLookup: (context: NunjucksRenderContext, frame: NunjucksFrame, name: string) => unknown;
    callWrap: (obj: unknown, name: string, context: NunjucksRenderContext, args: unknown[]) => unknown;
}

/** Member names that lead from a value to its constructor or prototype, and from there to `Function`. */
const RESTRICTED_MEMBER_NAMES: ReadonlySet<string> = new Set([
    'constructor',
    'prototype',
    '__proto__',
    '__defineGetter__',
    '__defineSetter__',
    '__lookupGetter__',
    '__lookupSetter__',
]);

/** Values a template may never hold: constructors that compile code from strings, and reflection over any object. */
const RESTRICTED_VALUES: ReadonlySet<unknown> = new Set<unknown>([
    Function,
    (async () => undefined).constructor,
    (function* () { /* generator constructor reference only */ }).constructor,
    (async function* () { /* async generator constructor reference only */ }).constructor,
    globalThis.eval,
    Object,
    Reflect,
    globalThis,
    globalThis.process,
].filter((value) => value !== undefined && value !== null));

/** Guards this module installed, so hardening again does not wrap a guard in another guard. */
const installedGuards = new WeakSet<object>();

/** Thrown when a template tries to use a value the sandbox does not allow. */
export class TemplateSandboxError extends Error {
    constructor(subject: string) {
        super(`Templates may not access ${subject}`);
        this.name = 'TemplateSandboxError';
    }
}

/**
 * Guards the nunjucks runtime used by every nunjucks environment in this process. After this call:
 * - a member named `constructor`, `prototype`, `__proto__` or one of the `__define/lookup Getter/Setter__`
 *   accessors reads as `undefined`
 * - a bare name resolves only to a template variable, a key of the render data, or an environment global,
 *   never to a property the render data inherits (such as `valueOf`)
 * - a lookup or call that would produce or use `Function` (or its async and generator variants), `eval`,
 *   `Object`, `Reflect`, `globalThis`, `process` or the render context throws a {@link TemplateSandboxError}
 *
 * Safe to call any number of times: a hook that already carries the guard is left as it is.
 */
export function HardenNunjucksRuntime(): void {
    const runtime = (nunjucks as unknown as { runtime: NunjucksRuntimeHooks }).runtime;
    installGuard(runtime, 'memberLookup', guardMemberLookup);
    installGuard(runtime, 'contextOrFrameLookup', guardContextOrFrameLookup);
    installGuard(runtime, 'callWrap', guardCallWrap);
}

/** Replaces one runtime hook with its guarded version, unless the hook is already a guard. */
function installGuard<K extends keyof NunjucksRuntimeHooks>(
    runtime: NunjucksRuntimeHooks,
    hook: K,
    guard: (original: NunjucksRuntimeHooks[K]) => NunjucksRuntimeHooks[K],
): void {
    if (installedGuards.has(runtime[hook])) {
        return;
    }
    const guarded = guard(runtime[hook]);
    installedGuards.add(guarded);
    runtime[hook] = guarded;
}

/**
 * `obj.key` and `obj[key]`. The key is converted to a string once, so a computed key cannot change
 * between the check and the read. The member is checked before nunjucks reads it again; templates
 * cannot define accessors (the accessor helpers are restricted names), so both reads see the same value.
 */
function guardMemberLookup(original: NunjucksRuntimeHooks['memberLookup']): NunjucksRuntimeHooks['memberLookup'] {
    return (obj, val) => {
        if (obj === undefined || obj === null || typeof val === 'symbol') {
            return undefined;
        }
        const key = String(val);
        if (RESTRICTED_MEMBER_NAMES.has(key)) {
            return undefined;
        }
        assertAllowed(obj, `members of a restricted value (reading "${key}")`);
        assertAllowed(readMember(obj, key), `the member "${key}"`);
        return original(obj, key);
    };
}

/** A bare name such as `{{ user }}`: a template variable, then the render data, then the environment globals. */
function guardContextOrFrameLookup(original: NunjucksRuntimeHooks['contextOrFrameLookup']): NunjucksRuntimeHooks['contextOrFrameLookup'] {
    return (context, frame, name) => {
        if (RESTRICTED_MEMBER_NAMES.has(name)) {
            return undefined;
        }
        const value = original(context, frame, name);
        if (value === undefined || !isOwnBinding(context, frame, name)) {
            return undefined;
        }
        assertAllowed(value, `the name "${name}"`, context);
        return value;
    };
}

/** A call such as `{{ fn(x) }}`. nunjucks passes the render context as `this`, so a call may not return it. */
function guardCallWrap(original: NunjucksRuntimeHooks['callWrap']): NunjucksRuntimeHooks['callWrap'] {
    return (obj, name, context, args) => {
        assertAllowed(obj, `the function "${name}"`, context);
        const result = original(obj, name, context, args);
        assertAllowed(result, `the value returned by "${name}"`, context);
        return result;
    };
}

/** True when a bare name is a template variable, a key of the render data, or an environment global. */
function isOwnBinding(context: NunjucksRenderContext, frame: NunjucksFrame, name: string): boolean {
    return frame.lookup(name) !== undefined
        || Object.hasOwn(context.getVariables(), name)
        || Object.hasOwn(context.env.globals, name);
}

/** Reads a member the way a template does, including members of primitive strings and numbers. */
function readMember(obj: unknown, key: string): unknown {
    return (obj as { readonly [member: string]: unknown })[key];
}

function assertAllowed(value: unknown, subject: string, context?: NunjucksRenderContext): void {
    if (RESTRICTED_VALUES.has(value) || (context !== undefined && value === context)) {
        throw new TemplateSandboxError(subject);
    }
}
