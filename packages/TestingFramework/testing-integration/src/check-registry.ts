/**
 * check-registry.ts — the global registry of named integration checks.
 *
 * Keyed by '<bundle>.<localId>' (e.g. 'server-cache.S1'). Both the
 * IntegrationTestDriver and the transitional tsx scripts resolve checks from this
 * single registry, so there is no drift between the two execution paths.
 *
 * Implemented as a BaseSingleton (CLAUDE.md critical rule 7) so a single instance
 * is guaranteed across the process even when bundlers duplicate module code.
 */
import { BaseSingleton } from '@memberjunction/global';
import { NamedCheck, BundleLifecycle } from './check';
import type { IntegrationDbPlatform } from './config';

export class IntegrationCheckRegistry extends BaseSingleton<IntegrationCheckRegistry> {
    private checks = new Map<string, NamedCheck>();
    private lifecycles = new Map<string, BundleLifecycle>();
    private bundlePlatforms = new Map<string, readonly IntegrationDbPlatform[]>();

    protected constructor() {
        super();
    }

    public static get Instance(): IntegrationCheckRegistry {
        return super.getInstance<IntegrationCheckRegistry>();
    }

    /** Register (or replace) a check by its Id. */
    public Register(check: NamedCheck): void {
        this.checks.set(check.Id, check);
    }

    /** Resolve a single check by Id; returns undefined for unknown ids (tolerant, by design). */
    public Get(id: string): NamedCheck | undefined {
        return this.checks.get(id);
    }

    /** All checks whose Id starts with `<prefix>.` (e.g. GetBundle('server-cache')). */
    public GetBundle(prefix: string): NamedCheck[] {
        return [...this.checks.values()].filter(c => c.Id.startsWith(prefix + '.'));
    }

    /**
     * The distinct bundle names — the `<bundle>` segment of every registered check Id. The
     * tsx↔metadata drift-check test uses this to assert every bundle has both siblings (a tsx
     * dispatcher script and a metadata Test record).
     */
    public GetBundleNames(): string[] {
        const names = new Set<string>();
        for (const id of this.checks.keys()) {
            const dot = id.indexOf('.');
            if (dot > 0) {
                names.add(id.slice(0, dot));
            }
        }
        return [...names].sort();
    }

    /**
     * Register a bundle's setup/teardown lifecycle (mutating bundles that share a fixture).
     * Both the driver and the standalone dispatcher scripts look this up by bundle name so a
     * bundle's fixture is created/torn down identically on either execution path.
     */
    public RegisterLifecycle(bundle: string, lifecycle: BundleLifecycle): void {
        this.lifecycles.set(bundle, lifecycle);
    }

    /** The lifecycle for a bundle, or undefined when the bundle needs no shared fixture. */
    public GetLifecycle(bundle: string): BundleLifecycle | undefined {
        return this.lifecycles.get(bundle);
    }

    /**
     * Restrict a bundle to specific database platforms. Undeclared bundles run everywhere —
     * that is the default and should stay the default.
     *
     * This exists ONLY for bundles that are **dialect-impossible** on a platform: their checks
     * issue raw platform-specific SQL that has no meaning on the other backend. It is NOT a
     * quarantine list. A bundle that runs on both platforms and *fails* on one has found a
     * parity bug — the very thing the PostgreSQL lane exists to surface — and must stay red
     * rather than being declared away.
     */
    public RegisterBundlePlatforms(bundle: string, platforms: readonly IntegrationDbPlatform[]): void {
        if (!platforms || platforms.length === 0) {
            throw new Error(
                `RegisterBundlePlatforms('${bundle}'): at least one platform is required. ` +
                `A bundle that runs nowhere would silently vanish from every lane — omit the ` +
                `declaration entirely if the bundle should run on all platforms.`
            );
        }
        this.bundlePlatforms.set(bundle, platforms);
    }

    /**
     * Whether a bundle can run on the given platform. Undeclared bundles always can.
     */
    public BundleRunsOnPlatform(bundle: string, platform: IntegrationDbPlatform): boolean {
        const declared = this.bundlePlatforms.get(bundle);
        return declared === undefined || declared.includes(platform);
    }
}
