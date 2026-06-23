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
import { NamedCheck } from './check';

export class IntegrationCheckRegistry extends BaseSingleton<IntegrationCheckRegistry> {
    private checks = new Map<string, NamedCheck>();

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
}
