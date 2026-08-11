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
export async function importFromHost(pkgName: string, configFilePath?: string): Promise<Record<string, unknown>> {
  try {
    return (await import(pkgName)) as Record<string, unknown>;
  } catch (error: unknown) {
    if (!isResolutionFailure(error)) {
      throw error;
    }
    const anchors = [
      path.join(process.cwd(), 'package.json'),
      configFilePath,
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
