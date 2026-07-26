/**
 * @fileoverview Integration-check-module preloader — the seam that lets the PUBLISHED
 * `mj test` CLI run check bundles that live in packages it must not depend on.
 * @module @memberjunction/testing-cli
 *
 * MemberJunction's own integration-test content lives in the PRIVATE
 * `@memberjunction/integration-test-suite` package (never published), while the
 * `IntegrationTestDriver` resolves bundles by pure string lookup on the shared
 * `IntegrationCheckRegistry`. Someone therefore has to IMPORT the content package so its
 * bundles self-register before the driver runs. A static import here would recreate the
 * ERR_MODULE_NOT_FOUND shipping-bug class (published code importing a package consumers
 * can't install), so the modules to load are declared in configuration:
 *
 *   // mj.config.cjs (repo root)
 *   testing: { checkModules: ['@memberjunction/integration-test-suite'] }
 *
 * plus an ad-hoc `--checks-module` flag (parity with `--oracles-module`). Deployments
 * without the key simply load nothing extra — external adopters point it at their own
 * check packages.
 *
 * Sanctioned dynamic-import use (category 5: runtime plugin discovery from config) —
 * the specifiers are unknown at build time by design.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { IntegrationCheckRegistry } from '@memberjunction/testing-integration';

export interface LoadedCheckModulesSummary {
    /** Specifiers that imported successfully. */
    loaded: string[];
    /** Specifier → error message for imports that failed (non-fatal, reported). */
    failed: Array<{ specifier: string; error: string }>;
    /** Bundle names newly present on the registry after loading. */
    newBundles: string[];
}

/**
 * Side-effect-import each configured check module so its bundles register on the
 * `IntegrationCheckRegistry`. Bare specifiers (package names) import as-is through Node
 * resolution; relative/absolute paths resolve against `cwd` and import via file:// URL.
 *
 * Per-specifier failures are collected, not thrown — a missing optional module should
 * produce an actionable report line, and the driver's own "Unknown integration check
 * bundle" oracle stays the backstop for anything that truly never registered.
 */
export async function loadCheckModules(specifiers: string[], cwd: string = process.cwd()): Promise<LoadedCheckModulesSummary> {
    const before = new Set(IntegrationCheckRegistry.Instance.GetBundleNames());
    const summary: LoadedCheckModulesSummary = { loaded: [], failed: [], newBundles: [] };

    for (const specifier of specifiers) {
        try {
            if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
                const absPath = path.resolve(cwd, specifier);
                if (!existsSync(absPath)) {
                    throw new Error(`path not found: ${absPath}`);
                }
                // Dynamic import: plugin discovery from config — path known only at runtime.
                await import(pathToFileURL(absPath).href);
            } else {
                // Bare package specifier — let Node resolution find it (workspace symlink
                // in-repo; node_modules in an adopter's project).
                await import(specifier);
            }
            summary.loaded.push(specifier);
        } catch (err) {
            summary.failed.push({ specifier, error: err instanceof Error ? err.message : String(err) });
        }
    }

    summary.newBundles = IntegrationCheckRegistry.Instance.GetBundleNames().filter(b => !before.has(b));
    return summary;
}
