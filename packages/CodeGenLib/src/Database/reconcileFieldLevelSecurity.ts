import { EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { ReconcileFieldPermissions } from '@memberjunction/core-entities-server';
import { logError, logStatus } from '../Misc/status_logging';

/**
 * Brings every field-security-enabled entity's permission rows back in line with its current
 * fields and entity-level permissions.
 *
 * This is the schema-change half of field-security lifecycle management, and the reason it lives
 * in CodeGen: a column added to an enabled entity has no permission rows, and on an enabled
 * entity a field with no rows is DENIED. Without this pass a new column would be invisible to
 * every user — including the administrator who added it — until something else happened to
 * reconcile. It also removes rows orphaned by a dropped column or a role that lost entity access.
 *
 * Must run AFTER the metadata refresh that follows `manageMetadata`, or it computes the delta
 * from a field list that predates the columns it exists to cover.
 *
 * Failures are logged and swallowed. Reconciliation is a maintenance pass over data CodeGen does
 * not own; failing the whole run — after schema, views and procs have already been written —
 * would trade a recoverable permissions gap for an unrecoverable half-finished build. The gap is
 * also visible rather than silent: a missing row denies, so the symptom is "I cannot see this new
 * column", not "everyone can see it".
 */
export async function reconcileFieldLevelSecurity(provider: IMetadataProvider, currentUser: UserInfo): Promise<boolean> {
    const enabled = (provider?.Entities ?? []).filter((e: EntityInfo) => e.EnableFieldLevelSecurity);
    if (enabled.length === 0) {
        return true; // nothing opted in — the overwhelmingly common case
    }

    let inserted = 0;
    let deleted = 0;
    let failures = 0;

    for (const entity of enabled) {
        try {
            const result = await ReconcileFieldPermissions(entity, provider, currentUser);
            inserted += result.Inserted;
            deleted += result.Deleted;
        } catch (e) {
            failures++;
            logError(`   Field-security reconciliation failed for '${entity.Name}': ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    if (inserted > 0 || deleted > 0) {
        logStatus(
            `   Field-level security: reconciled ${enabled.length} entity(ies) — ` +
            `${inserted} permission row(s) added, ${deleted} removed`
        );
    }
    return failures === 0;
}
