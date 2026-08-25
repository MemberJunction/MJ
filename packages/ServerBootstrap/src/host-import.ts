/**
 * Host-anchored dynamic import for runtime-configured packages.
 *
 * A bare `import(pkgName)` resolves from THIS package (server-bootstrap), which cannot
 * declare packages whose names are only known at runtime — mj.config.cjs supplies them.
 * npm's hoisted node_modules let that bare import resolve by accident; pnpm's strict
 * per-package layout does not, because the packages are declared by (and linked into) the
 * HOST application, e.g. MJAPI. `importFromHost` tries the bare import first (identical
 * behavior to before on npm layouts) and, when the package cannot be resolved, retries
 * from each host anchor — the working directory, the mj.config.cjs that named the
 * package, and the process entrypoint. (Dynamic import is justified here as runtime
 * plugin discovery: the names come from configuration, not code.)
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

/**
 * True when the error is a module-RESOLUTION failure (the module could not be found or
 * reached), as opposed to a module that was found but threw while loading — the latter is
 * a real error that must surface. ESM raises ERR_MODULE_NOT_FOUND, CommonJS resolution
 * (createRequire) raises MODULE_NOT_FOUND, and an exports-map mismatch raises
 * ERR_PACKAGE_PATH_NOT_EXPORTED. Some ESM loader shims (ts-node's, notably — the loader
 * MJAPI runs under) throw resolution failures as PLAIN Errors with no code at all, so
 * when there is no code, recognize Node's own resolver message instead.
 *
 * ⚠ Under ts-node's shim the coded branch never fires (the shim strips custom error
 * properties crossing the module-hooks thread), so the message branch is LOAD-BEARING
 * there: if a future Node rewords its resolver messages, this predicate must be updated
 * or the pnpm fallback silently stops working under ts-node hosts.
 *
 * Keep in sync with `IsModuleResolutionFailure` in @memberjunction/open-app-engine's
 * `src/install/migration-runner.ts` — same heuristic, duplicated because the two
 * packages cannot depend on each other and cross-package re-exports are disallowed.
 */
export function isResolutionFailure(error: unknown): boolean {
  const { code, message } = (error as { code?: string; message?: string }) ?? {};
  if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND' || code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
    return true;
  }
  return code === undefined && typeof message === 'string' && /^Cannot find (package|module) /.test(message);
}

/**
 * Renders an unknown thrown value as something an operator can read — safely.
 *
 * Under MJAPI's loader (`ts-node/esm` registered through `node:module`), a dynamic-import
 * resolution failure crosses the module-hooks thread and arrives as a **null-prototype object
 * with zero own properties**, carrying only `Symbol(nodejs.util.inspect.custom)`. Two things
 * go wrong if you treat it like an error (MJ#3975 §4):
 *
 *   - `String(value)` THROWS `TypeError: Cannot convert object to primitive value` — a
 *     diagnostic that kills the process while trying to explain why the process is dying.
 *   - `console.warn('msg', value)` renders it as `{}`, so the whole report is `{}`.
 *
 * So: no coercion of an unrecognised object, and a message that states the value carried
 * nothing rather than printing an empty one. The caller supplies the identity (which package
 * was being loaded) — that is the only place it exists.
 */
export function describeThrown(value: unknown): string {
  if (value instanceof Error) {
    const code = (value as { code?: unknown }).code;
    return typeof code === 'string' ? `${value.message} (code ${code})` : value.message;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return `${String(value)} was thrown (no error object)`;
  }
  if (typeof value === 'object') {
    // Never String()/JSON.stringify a null-prototype object — the first throws and the second
    // yields '{}'. Report the shape instead, and say the underlying reason is unavailable.
    const props = Object.getOwnPropertyNames(value);
    const detail = props.length > 0
      ? `own properties: ${props.join(', ')}`
      : 'no message and no own properties — the ESM loader hook stripped the underlying resolution error';
    return `a non-Error value was thrown (${detail})`;
  }
  return `a non-Error ${typeof value} value was thrown`;
}

/** One host anchor that was tried when resolving a runtime-configured package. */
export interface HostResolutionAttempt {
  /** The anchor resolution was attempted from (a mj.config.cjs, a package.json, an entrypoint). */
  Anchor: string;
  /** Why this anchor could not see the package. */
  Error: string;
}

/** Where a runtime-configured package resolves from the host, and what was tried. */
export interface HostResolutionReport {
  /** The package that was looked up. */
  PackageName: string;
  /** The resolved file, when some anchor could see it. */
  Resolved?: string;
  /** Every anchor tried, and its failure, in priority order. */
  Attempts: HostResolutionAttempt[];
}

/**
 * Reports whether a runtime-configured package is reachable from the host, and from where.
 *
 * Deliberately uses `createRequire().resolve` only — a plain CommonJS resolver that runs
 * in-process, raises ordinary catchable errors, and never involves the ESM loader hooks. That
 * is the whole point: the failure mode this exists for (MJ#3975 §4) is a loader-hook resolution
 * failure that a `try`/`catch` cannot see, so the explanation has to be computed WITHOUT going
 * near the loader. Because it is CJS-only, a package whose exports map declares only an
 * `"import"` condition will be reported unreachable even though `import()` could load it — so
 * this is a diagnostic, never a gate: nothing skips an import on the strength of it.
 */
export function describeHostResolution(pkgName: string, configFilePath?: string): HostResolutionReport {
  const anchors = [configFilePath, path.join(process.cwd(), 'package.json'), process.argv[1]]
    .filter((anchor): anchor is string => typeof anchor === 'string' && anchor.length > 0);
  const attempts: HostResolutionAttempt[] = [];
  for (const anchor of anchors) {
    try {
      return { PackageName: pkgName, Resolved: createRequire(anchor).resolve(pkgName), Attempts: attempts };
    } catch (error: unknown) {
      attempts.push({ Anchor: anchor, Error: describeThrown(error) });
    }
  }
  return { PackageName: pkgName, Attempts: attempts };
}

/**
 * Imports a runtime-configured package from the HOST application's context.
 *
 * Resolution and evaluation are handled separately on the fallback path: an anchor that
 * cannot SEE the package means "try the next anchor", but once an anchor resolves it,
 * any failure from loading the module (a missing transitive dependency, a throw in its
 * top-level code) is the module's own problem and is surfaced as-is — never masked by
 * the original "cannot find package" error.
 *
 * Note on the resolver: `createRequire().resolve` runs under CommonJS conditions, so a
 * package whose exports map declares ONLY an `"import"` condition cannot be resolved by
 * the fallback (surfaced with an actionable error). On a dual CJS/ESM package it selects
 * the CJS entry, so `import()` of that file would load a second physical module instance
 * alongside any ESM copy already in the process — fine for MJ-shaped single-condition
 * packages, but keep it in mind before widening this mechanism.
 */
export async function importFromHost(pkgName: string, configFilePath?: string): Promise<Record<string, unknown>> {
  try {
    return (await import(pkgName)) as Record<string, unknown>;
  } catch (error: unknown) {
    if (!isResolutionFailure(error)) {
      throw error;
    }
    // Anchor priority: the mj.config.cjs that NAMED the package is the authoritative host,
    // so it is consulted first — cwd can be a different checkout entirely (an operator
    // launching instance A's server from instance B's directory would otherwise silently
    // load B's copy). cwd and the process entrypoint are fallbacks for hosts whose config
    // lives outside the tree that carries the packages (e.g. a workspace-root config with
    // the packages linked into the app directory).
    const anchors = [
      configFilePath,
      path.join(process.cwd(), 'package.json'),
      process.argv[1],
    ].filter((anchor): anchor is string => typeof anchor === 'string' && anchor.length > 0);
    let sawExportsMapMismatch = false;
    for (const anchor of anchors) {
      let resolved: string;
      try {
        resolved = createRequire(anchor).resolve(pkgName);
      } catch (resolveError: unknown) {
        if ((resolveError as { code?: string })?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
          sawExportsMapMismatch = true;
          continue;
        }
        if (!isResolutionFailure(resolveError)) {
          throw resolveError;
        }
        continue; // this anchor can't see the package — try the next
      }
      // Resolved. Anything that fails from here is the module's own problem — surface it.
      return (await import(pathToFileURL(resolved).href)) as Record<string, unknown>;
    }
    if (sawExportsMapMismatch) {
      throw new Error(
        `Package '${pkgName}' is reachable from the host, but its exports map has no CJS-resolvable condition ` +
          `(add a "default" or "require" condition to its package.json exports), so the host-anchored fallback cannot load it.`,
        { cause: error },
      );
    }
    throw error; // no anchor resolved it — surface the original bare-import failure
  }
}
