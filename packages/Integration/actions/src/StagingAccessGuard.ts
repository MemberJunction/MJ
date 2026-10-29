/**
 * A restored staging database the restoring login cannot open. `RESTORE DATABASE` can succeed and
 * leave the login that ran it, even as the database owner, unable to connect (error 18456 state 38):
 * a backup taken from another server carries that server's database users, and when one of them has
 * the same name as this server's login but a foreign SID, the owner mapping is refused. A backup of
 * another MemberJunction database always carries such users (`MJ_Connect`, `MJ_CodeGen`). Nothing a
 * login with only `dbcreator` holds can repair that from outside the database, so the restore
 * phase checks the access once and fails with the remedy instead of letting the next phase fail
 * with a bare "Login failed".
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
        `The backup carries database users from its source server; one with the same name as this login ` +
        `but another SID blocks the login even though it owns the database. Grant the login ` +
        `CONNECT ANY DATABASE and SELECT ALL USER SECURABLES on this server, or restore with a sysadmin login.`
    );
}
