/**
 * @fileoverview Startup backstop for the system user's field-level access.
 *
 * The save-time guards in `MJEntityFieldPermissionEntityServer` refuse a change that would leave
 * the system user short of its entity-level access — but they only see changes that go through the
 * entity layer with a warm user cache. Direct SQL, a migration, a role removed from the account,
 * or a save made during another process's bootstrap all reach the same state unobserved.
 *
 * Field security has no runtime exemption for the system user, so that state is not inert: the
 * server's own background work silently loses a column, and because engine caches are process-wide
 * the partially loaded record it caches is then served to everyone. This makes it loud at the one
 * moment someone is watching.
 *
 * @module @memberjunction/generic-database-provider
 */
import { IMetadataProvider, IStartupSink, LogError, LogStatus, RegisterForStartup, UserInfo } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';
import { FindSystemUserFieldAccessViolations } from './systemUserFieldAccess.js';

/** How many offending fields to name before summarising the rest. */
const MAX_REPORTED = 10;

/**
 * Reports — loudly, but without blocking boot — any field on an FLS-enabled entity that the MJ
 * system user can no longer fully use.
 *
 * **Warns rather than refuses to start.** The condition is bad configuration, not a broken build,
 * and a server that will not boot is a worse failure than one that boots and says exactly what is
 * wrong. It is also self-inflicted-recovery-hostile: the administrator's route to fixing the rows
 * is usually the application that would refuse to start.
 *
 * Costs nothing when nothing is enabled: entities with `EnableFieldLevelSecurity = false` are
 * skipped on a boolean read, and there are no queries at any point.
 */
@RegisterForStartup({
    priority: 900,
    severity: 'warn',
    description: 'Verifies the MJ system user retains its field-level access on FLS-enabled entities',
})
export class SystemUserFieldAccessCheck extends BaseSingleton<SystemUserFieldAccessCheck> implements IStartupSink {
    protected constructor() {
        super();
    }

    public static get Instance(): SystemUserFieldAccessCheck {
        return super.getInstance<SystemUserFieldAccessCheck>();
    }

    public async HandleStartup(_contextUser?: UserInfo, provider?: IMetadataProvider): Promise<void> {
        this.Run(provider);
    }

    /**
     * Runs the sweep and logs the outcome. Separate from {@link HandleStartup} so callers that
     * already hold a provider — tests, a maintenance command — can invoke it directly.
     *
     * @returns the number of offending fields found
     */
    public Run(provider?: IMetadataProvider | null): number {
        const violations = FindSystemUserFieldAccessViolations(provider);
        if (violations.length === 0) {
            return 0;
        }

        const shown = violations
            .slice(0, MAX_REPORTED)
            .map(v => `  - ${v.EntityName}.${v.FieldName} (cannot ${v.Verb})`)
            .join('\n');
        const more = violations.length > MAX_REPORTED ? `\n  ...and ${violations.length - MAX_REPORTED} more` : '';

        LogError(
            `[FieldSecurity] The MJ system user has lost field-level access to ${violations.length} field(s). ` +
            `The server runs background work as that account and engine caches are process-wide, so it may cache ` +
            `partially loaded records that every user then reads. Field security has no exempt user — restore an ` +
            `'Allow' on a role the system user holds, or take the offending role off that account.\n${shown}${more}`
        );
        return violations.length;
    }
}

/**
 * Loader stub — keeps the class (and therefore its startup registration) from being tree-shaken.
 */
export function LoadSystemUserFieldAccessCheck(): void {
    // no-op
}
