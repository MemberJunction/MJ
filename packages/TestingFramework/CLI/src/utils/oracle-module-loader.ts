/**
 * @fileoverview Custom-oracle plugin loader for `--oracles-module=path/to/module.cjs`.
 * @module @memberjunction/testing-cli
 *
 * Lets non-MJ users plug app-specific oracles into the regression suite without
 * modifying TestingFramework itself. The module path is resolved relative to the
 * caller's cwd, dynamically imported (Node resolves CJS + ESM automatically),
 * and every exported `IOracle` is registered on the engine.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import type { TestEngine } from '@memberjunction/testing-engine';
import type { IOracle } from '@memberjunction/testing-engine';

/**
 * Duck-type check: an `IOracle` has a string `type` and an async `evaluate`
 * function. We don't `instanceof` against a class because the user's module
 * may import its own copy of the interface (different package version, etc.).
 */
function isOracleInstance(value: unknown): value is IOracle {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as { type?: unknown; evaluate?: unknown };
    return (
        typeof candidate.type === 'string' &&
        candidate.type.length > 0 &&
        typeof candidate.evaluate === 'function'
    );
}

/**
 * Heuristic class-vs-instance check. Classes are functions whose prototype
 * defines `evaluate`. We instantiate them with no args — Oracle implementations
 * shouldn't need constructor arguments since their config flows through `evaluate()`.
 */
function isOracleClass(value: unknown): value is new () => IOracle {
    if (typeof value !== 'function') return false;
    const proto = (value as { prototype?: { evaluate?: unknown; type?: unknown } }).prototype;
    if (!proto) return false;
    return typeof proto.evaluate === 'function';
}

export interface LoadedOracleSummary {
    /** Module path that was loaded. */
    modulePath: string;
    /** Names of oracles that were successfully registered. */
    registered: string[];
    /** Export keys we walked past because they didn't look like oracles. */
    skipped: string[];
}

/**
 * Load a user-supplied oracle module and register every `IOracle` export
 * onto the provided TestEngine instance. Returns a summary so the caller
 * can log what happened.
 *
 * Exports recognized:
 *   - A class implementing `IOracle` — instantiated with no args.
 *   - An object instance with `{ type: string, evaluate: fn }` — used as-is.
 *
 * Anything else (constants, helper functions, unrelated exports) is silently
 * skipped — callers like the CLI surface this as a warning, not an error.
 *
 * @throws if the module file doesn't exist or the import itself fails.
 */
export async function loadOraclesModule(
    modulePath: string,
    engine: TestEngine,
): Promise<LoadedOracleSummary> {
    const absPath = path.resolve(modulePath);
    if (!existsSync(absPath)) {
        throw new Error(`Oracle module not found: ${absPath}`);
    }

    // Dynamic import: this is plugin discovery from a path that's only known
    // at runtime (per CLI flag). Static import isn't possible here. Node's
    // ESM resolver handles both .cjs and .mjs/.js targets when given a
    // file:// URL.
    const fileUrl = pathToFileURL(absPath).href;
    const mod = await import(fileUrl);

    // Walk both the namespace exports (named exports + a synthetic `default`)
    // and any CJS `module.exports = {...}` shape that landed under `.default`.
    // Node's CJS interop exposes the same value at BOTH `mod.A` and
    // `mod.default.A` for a `module.exports = { A }`, so dedupe by reference
    // to avoid double-registering.
    const seen = new Set<unknown>();
    const candidates: Array<[string, unknown]> = [];

    const consider = (name: string, value: unknown) => {
        if (value === undefined || value === null) return;
        if (seen.has(value)) return;
        seen.add(value);
        candidates.push([name, value]);
    };

    // Walk top-level names first so they win the dedupe "first seen" slot —
    // those are the names the author actually wrote. Then walk into a CJS
    // `module.exports = { … }` namespace if present (it lands under
    // `mod.default` when imported via ESM `import()`). Skip the `default`
    // key itself when it's the CJS wrapper so we don't surface it as a
    // bogus "skipped" candidate.
    const defaultExport = mod.default;
    const defaultIsCjsNamespace =
        defaultExport &&
        typeof defaultExport === 'object' &&
        defaultExport !== null &&
        !isOracleInstance(defaultExport) &&
        !isOracleClass(defaultExport);

    // CJS-interop synthetic keys Node exposes on imported CJS modules — these
    // aren't real user exports and shouldn't show up in summary.skipped.
    const CJS_NOISE_KEYS = new Set(['module.exports', '__esModule']);

    for (const [name, value] of Object.entries(mod)) {
        if (name === 'default' && defaultIsCjsNamespace) continue;
        if (CJS_NOISE_KEYS.has(name)) continue;
        consider(name, value);
    }
    if (defaultIsCjsNamespace) {
        for (const [name, value] of Object.entries(defaultExport as Record<string, unknown>)) {
            consider(`default.${name}`, value);
        }
    }

    const registered: string[] = [];
    const skipped: string[] = [];

    for (const [name, value] of candidates) {
        let oracle: IOracle | undefined;

        if (isOracleInstance(value)) {
            oracle = value;
        } else if (isOracleClass(value)) {
            try {
                oracle = new value();
                if (!isOracleInstance(oracle)) {
                    skipped.push(`${name} (instantiated but missing 'type' or 'evaluate')`);
                    continue;
                }
            } catch (err) {
                skipped.push(`${name} (instantiation threw: ${(err as Error).message})`);
                continue;
            }
        } else {
            skipped.push(name);
            continue;
        }

        engine.RegisterOracle(oracle);
        registered.push(oracle.type);
    }

    return { modulePath: absPath, registered, skipped };
}
