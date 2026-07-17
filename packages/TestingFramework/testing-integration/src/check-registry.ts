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

export class IntegrationCheckRegistry extends BaseSingleton<IntegrationCheckRegistry> {
    private checks = new Map<string, NamedCheck>();
    private lifecycles = new Map<string, BundleLifecycle>();

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
}
