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
import { readFileSync } from 'node:fs';
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
/**
 * Host anchors used to resolve runtime-configured packages. The mj.config.cjs that
 * named the package is first — cwd can be a different checkout.
 */
function hostAnchors(configFilePath?: string): string[] {
  return [
    configFilePath,
    path.join(process.cwd(), 'package.json'),
    process.argv[1],
  ].filter((anchor): anchor is string => typeof anchor === 'string' && anchor.length > 0);
}

/**
 * Walks up from a resolved file looking for a `package.json` whose `name` matches.
 * Used when the package's exports map does not expose `./package.json`.
 */
function findPackageJsonWithName(fromFile: string, pkgName: string): string | null {
  let dir = path.dirname(fromFile);
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'package.json');
    try {
      const json = JSON.parse(readFileSync(candidate, 'utf8')) as { name?: string };
      if (json.name === pkgName) {
        return candidate;
      }
    } catch {
      // missing or unreadable — keep walking
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

/**
 * Resolves the on-disk `package.json` of a host-visible package so callers can
 * introspect `memberjunction.serverExtensions` without relying on an exports map.
 * Returns `null` when no host anchor can see the package.
 */
export function resolvePackageJsonFromHost(pkgName: string, configFilePath?: string): string | null {
  for (const anchor of hostAnchors(configFilePath)) {
    const req = createRequire(anchor);
    try {
      return req.resolve(`${pkgName}/package.json`);
    } catch (resolveError: unknown) {
      if ((resolveError as { code?: string })?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
        // exports map omits package.json — resolve the main entry and walk up.
      } else if (!isResolutionFailure(resolveError)) {
        throw resolveError;
      }
    }
    try {
      const main = req.resolve(pkgName);
      const found = findPackageJsonWithName(main, pkgName);
      if (found) {
        return found;
      }
    } catch (mainError: unknown) {
      if (!isResolutionFailure(mainError) && (mainError as { code?: string })?.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
        throw mainError;
      }
    }
  }
  return null;
}

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
    const anchors = hostAnchors(configFilePath);
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
