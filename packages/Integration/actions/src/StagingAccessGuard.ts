/**
 * A restored staging database the restoring login cannot open. `RESTORE DATABASE` by a login that is
 * not sysadmin succeeds and records that login as the owner in master, but the restored database
 * still carries the `dbo` SID of its source server, and SQL Server maps a login to `dbo` only when the
 * SIDs match. The owner is therefore refused (error 18456 state 38, "failed to open the explicitly
 * specified database"), and only a sysadmin can re-sync the SIDs (`ALTER AUTHORIZATION`); the owner
 * cannot, because the permission check needs the very mapping that is broken. A freshly created
 * database has no such mismatch, which is why the same login opens its own empty databases fine.
 * The restore phase checks the access once and fails with the remedy instead of letting the next
 * phase fail with a bare "Login failed".
 */
export class StagingNotAccessibleError extends Error {
    public readonly ResultCode = 'STAGING_NOT_ACCESSIBLE';

    constructor(message: string) {
        super(message);
        this.name = 'StagingNotAccessibleError';
    }
}

/** The message a refused staging access reports: what happened, why, and the two remedies. */
export function StagingNotAccessibleMessage(stagingDbName: string, cause: string): string {
    return (
        `Restored [${stagingDbName}], but the SQL login MJAPI runs with cannot open it (${cause.trim()}). ` +
        `A database restored from another server keeps that server's dbo SID, so SQL Server does not map ` +
        `the restoring login to dbo even though it owns the database, and only a sysadmin can re-sync the owner. ` +
        `Grant the login CONNECT ANY DATABASE and SELECT ALL USER SECURABLES on this server, or run MJAPI with a sysadmin login.`
    );
}
