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

    /**
     * Register a check by its Id. Throws when the Id already belongs to a different check:
     * the earlier check would otherwise stop running without any failure to show for it.
     *
     * Registering the same check again is allowed. That covers the same object and an
     * equivalent copy (same Id, Name, tier flags and function source), which is what a
     * second evaluation of the same check module produces when a bundler duplicates it. An
     * equivalent copy replaces the stored one so the newest closure is the one that runs.
     */
    public Register(check: NamedCheck): void {
        const existing = this.checks.get(check.Id);
        if (existing === check) {
            return;
        }
        if (existing && !IntegrationCheckRegistry.isSameCheck(existing, check)) {
            throw new Error(
                `IntegrationCheckRegistry: check Id '${check.Id}' is already registered to a different check ` +
                `('${existing.Name}'; this one is '${check.Name}'). Give each check a unique Id.`
            );
        }
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
        const existing = this.lifecycles.get(bundle);
        if (existing === lifecycle) {
            return;
        }
        if (existing && !IntegrationCheckRegistry.isSameLifecycle(existing, lifecycle)) {
            throw new Error(
                `IntegrationCheckRegistry: bundle '${bundle}' already has a different lifecycle registered. ` +
                `A bundle has exactly one Setup/Teardown.`
            );
        }
        this.lifecycles.set(bundle, lifecycle);
    }

    /** The lifecycle for a bundle, or undefined when the bundle needs no shared fixture. */
    public GetLifecycle(bundle: string): BundleLifecycle | undefined {
        return this.lifecycles.get(bundle);
    }

    /** True when two check objects define the same check (a re-evaluated module's copy). */
    private static isSameCheck(a: NamedCheck, b: NamedCheck): boolean {
        return a.Id === b.Id
            && a.Name === b.Name
            && (a.RequiresMutation ?? false) === (b.RequiresMutation ?? false)
            && (a.RequiresLiveModel ?? false) === (b.RequiresLiveModel ?? false)
            && a.Fn.toString() === b.Fn.toString();
    }

    /** True when two lifecycles have the same Setup and Teardown source. */
    private static isSameLifecycle(a: BundleLifecycle, b: BundleLifecycle): boolean {
        return a.Setup.toString() === b.Setup.toString()
            && a.Teardown.toString() === b.Teardown.toString();
    }
}
