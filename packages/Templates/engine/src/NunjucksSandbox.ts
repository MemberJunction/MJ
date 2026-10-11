/**
 * @fileoverview Guards nunjucks so templates cannot run JavaScript or reach server objects.
 *
 * nunjucks has no sandbox mode, and a template can attack it at two points:
 * - **Compile time.** The compiler copies template-controlled names into the code it generates.
 *   {@link HardenNunjucksRuntime} wraps the parser that the compiler calls, so every parsed template is
 *   checked by `AssertTemplateTreeIsSafe` (`NunjucksCompileGuard.ts`) before it compiles.
 * - **Render time.** Every compiled template resolves bare names, member access and calls through
 *   three functions on nunjucks' shared runtime module: `contextOrFrameLookup`, `memberLookup` and
 *   `callWrap`. It finds filters and tests with the environment's `getFilter` and `getTest`, which read
 *   plain objects. Unguarded, a template can walk from any value to `Function`, or reach the render
 *   context and change the shared environment. {@link HardenNunjucksRuntime} wraps those functions in place.
 *
 * The parser, the runtime module and the `Environment` prototype are shared by every nunjucks
 * environment in the process, so the guard covers all of them, including templates loaded through
 * `include` and `import`.
 * @module @memberjunction/templates
 */
import nunjucks from 'nunjucks';
import { AssertTemplateTreeIsSafe } from './NunjucksCompileGuard';
import { TemplateSandboxError } from './TemplateSandboxError';

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

/** The registries of a nunjucks environment, and the methods that find a name in them. */
interface NunjucksEnvironmentRegistries {
    filters: object;
    tests: object;
    globals: object;
    getFilter: RegistryLookup;
    getTest: RegistryLookup;
    getGlobal: RegistryLookup;
}

/** `getFilter`, `getTest` and `getGlobal`, called on an environment. nunjucks accepts any value as the name. */
type RegistryLookup = (this: NunjucksEnvironmentRegistries, name: unknown) => unknown;

/** The nunjucks parser module. The compiler calls its `parse` for every template it compiles. */
interface NunjucksParser {
    parse: (src: string, extensions?: unknown, opts?: unknown) => unknown;
}

/** The nunjucks modules and classes the guard wraps or recognizes. */
interface NunjucksInternals {
    parser: NunjucksParser;
    runtime: NunjucksRuntimeHooks & { Frame: { prototype: object } };
    Environment: { prototype: NunjucksEnvironmentRegistries };
    Template: { prototype: object };
    lib: object;
    compiler: object;
    lexer: object;
    nodes: object;
}
const NUNJUCKS = nunjucks as unknown as NunjucksInternals;

/** Any function a guard can replace. */
type GuardableHook = (...args: never[]) => unknown;

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

/** nunjucks' base `Obj` class, which render contexts and templates extend. */
const NUNJUCKS_OBJ_PROTOTYPE: object = Object.getPrototypeOf(NUNJUCKS.Template.prototype);

/** nunjucks' base `EmitterObj` class, which environments and loaders extend. */
const NUNJUCKS_EMITTER_PROTOTYPE: object = Object.getPrototypeOf(NUNJUCKS.Environment.prototype);

/** Prototypes of the objects nunjucks uses to render: contexts and templates, environments and loaders, and frames. */
const NUNJUCKS_OBJECT_PROTOTYPES: readonly object[] = [NUNJUCKS_OBJ_PROTOTYPE, NUNJUCKS_EMITTER_PROTOTYPE, NUNJUCKS.runtime.Frame.prototype];

/** The nunjucks module and its submodules. */
const NUNJUCKS_MODULES: ReadonlySet<unknown> = new Set<unknown>([
    nunjucks, NUNJUCKS.runtime, NUNJUCKS.parser, NUNJUCKS.lib, NUNJUCKS.compiler, NUNJUCKS.lexer, NUNJUCKS.nodes,
]);

/** Guards this module installed, so hardening again does not wrap a guard in another guard. */
const installedGuards = new WeakSet<GuardableHook>();

/**
 * Guards the nunjucks parser and runtime used by every nunjucks environment in this process. After this call:
 * - a template whose names could change the compiled code fails to compile (see `AssertTemplateTreeIsSafe`)
 * - a filter, test or global resolves only to a name the environment registered itself, never to a member
 *   that every object inherits (such as `hasOwnProperty`); an object, a function or a symbol is refused as the name
 * - a member named `constructor`, `prototype`, `__proto__` or one of the `__define/lookup Getter/Setter__`
 *   accessors reads as `undefined`, unless it is an object's own data that is not a function;
 *   `__proto__` always reads as `undefined`
 * - a bare name resolves only to a template variable, an own key of the render data, or an own environment
 *   global, never to a property that the render data or the globals inherit
 * - a template may not read a member of the render context, an environment, a loader, a frame, a
 *   template or a nunjucks module, and a lookup or call that would return one of them throws
 * - a lookup or call that would produce or use `Function` (or its async and generator variants), `eval`,
 *   `Object`, `Reflect`, `globalThis` or `process` throws a {@link TemplateSandboxError}
 *
 * Safe to call any number of times: a hook that already carries the guard is left as it is.
 */
export function HardenNunjucksRuntime(): void {
    const { parser, runtime, Environment } = NUNJUCKS;
    installGuard(parser, 'parse', guardParse);
    installGuard(runtime, 'memberLookup', guardMemberLookup);
    installGuard(runtime, 'contextOrFrameLookup', guardContextOrFrameLookup);
    installGuard(runtime, 'callWrap', guardCallWrap);
    installGuard(Environment.prototype, 'getFilter', guardRegistryLookup('filters'));
    installGuard(Environment.prototype, 'getTest', guardRegistryLookup('tests'));
    installGuard(Environment.prototype, 'getGlobal', guardRegistryLookup('globals'));
}

/** Replaces one hook with its guarded version, unless the hook is already a guard. */
function installGuard<K extends PropertyKey, T extends Record<K, GuardableHook>>(
    target: T,
    hook: K,
    guard: (original: T[K]) => T[K],
): void {
    if (installedGuards.has(target[hook])) {
        return;
    }
    const guarded = guard(target[hook]);
    installedGuards.add(guarded);
    target[hook] = guarded;
}

/** Parsing for the compiler: the tree is checked before nunjucks compiles it. */
function guardParse(original: NunjucksParser['parse']): NunjucksParser['parse'] {
    return (src, extensions, opts) => {
        const tree = original(src, extensions, opts);
        AssertTemplateTreeIsSafe(tree);
        return tree;
    };
}

/**
 * `env.getFilter(name)`, `env.getTest(name)` and `env.getGlobal(name)`. nunjucks keeps each registry in a
 * plain object, so a name such as `toString` would find the member every object inherits. Only a name the
 * environment registered itself resolves. A name that is not there at all still fails as nunjucks reports it.
 *
 * The `select` and `reject` filters pass a template value as the name. The name is converted to a key once,
 * and nunjucks receives that same key, so it reads the key the guard checked. An object, a function or a
 * symbol is refused before conversion, because converting it could run template code.
 */
function guardRegistryLookup(registry: 'filters' | 'tests' | 'globals'): (original: RegistryLookup) => RegistryLookup {
    return (original) => function guardedRegistryLookup(this: NunjucksEnvironmentRegistries, name: unknown): unknown {
        if ((typeof name === 'object' && name !== null) || typeof name === 'function' || typeof name === 'symbol') {
            throw new TemplateSandboxError('Templates may not use an object, a function or a symbol as the name of a filter, test or global');
        }
        const key = String(name);
        const entries = this[registry];
        if (key in entries && !Object.hasOwn(entries, key)) {
            throw new TemplateSandboxError(`Templates may only use filters, tests and globals that the environment registered ("${key}")`);
        }
        return original.call(this, key);
    };
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
        if (isNunjucksObject(obj)) {
            throw new TemplateSandboxError(`Templates may not read members of the render context or other nunjucks objects (reading "${key}")`);
        }
        if (RESTRICTED_MEMBER_NAMES.has(key) && !isOwnDataValue(obj, key)) {
            return undefined;
        }
        assertAllowed(obj, `members of a restricted value (reading "${key}")`);
        assertAllowed(readMember(obj, key), `the member "${key}"`);
        return original(obj, key);
    };
}

/**
 * A bare name such as `{{ user }}`: a template variable, then an own key of the render data, then an own
 * environment global. The guard resolves the name itself, because nunjucks would also return members
 * that the render data or the globals inherit.
 */
function guardContextOrFrameLookup(): NunjucksRuntimeHooks['contextOrFrameLookup'] {
    return (context, frame, name) => {
        if (name === '__proto__') {
            return undefined;
        }
        const value = ownBinding(context, frame, name);
        if (value === undefined || (RESTRICTED_MEMBER_NAMES.has(name) && typeof value === 'function')) {
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

/** The value of a bare name: a template variable, else an own key of the render data, else an own environment global. */
function ownBinding(context: NunjucksRenderContext, frame: NunjucksFrame, name: string): unknown {
    const variable = frame.lookup(name);
    if (variable !== undefined) {
        return variable;
    }
    const data = context.getVariables();
    if (Object.hasOwn(data, name)) {
        return readMember(data, name);
    }
    const globals = context.env.globals;
    return Object.hasOwn(globals, name) ? readMember(globals, name) : undefined;
}

/**
 * True when an object (not a function) stores data that is not a function under `key` itself, as
 * `{"constructor": "Acme"}` does. A prototype's own `constructor` is a function, so it never counts,
 * and neither does `__proto__`.
 */
function isOwnDataValue(obj: unknown, key: string): boolean {
    return key !== '__proto__'
        && typeof obj === 'object' && obj !== null
        && Object.hasOwn(obj, key)
        && typeof readMember(obj, key) !== 'function';
}

/** True for the render context, an environment, a loader, a frame, a template or a nunjucks module. */
function isNunjucksObject(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    return NUNJUCKS_MODULES.has(value) || NUNJUCKS_OBJECT_PROTOTYPES.some((prototype) => prototype.isPrototypeOf(value));
}

/** Reads a member the way a template does, including members of primitive strings and numbers. */
function readMember(obj: unknown, key: string): unknown {
    return (obj as { readonly [member: string]: unknown })[key];
}

/** Throws when a lookup or call would give a template a restricted value, the render context or another nunjucks object. */
function assertAllowed(value: unknown, subject: string, context?: NunjucksRenderContext): void {
    if (RESTRICTED_VALUES.has(value) || isNunjucksObject(value) || (context !== undefined && value === context)) {
        throw new TemplateSandboxError(`Templates may not access ${subject}`);
    }
}
