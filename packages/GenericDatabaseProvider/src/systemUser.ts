import { UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * ID of the MJ **system user** — the account the server runs its own work as.
 *
 * Canonical definition. Seeded by the baseline on both platforms; do not change it without a
 * migration.
 *
 * **Why it lives in a server-side package.** This is a server concept: a browser has no system
 * account and no use for its ID, so shipping the constant in `@memberjunction/core` put a
 * server identity into a package that browsers bundle. It sits here because both concrete
 * providers (SQL Server and PostgreSQL) depend on this package and neither depends on the
 * other — so one definition serves both, and nothing above the data-provider layer needs it.
 *
 * Code that needs to ASK whether a user is the system user should not import this. It should
 * call `WellKnownUserSource.Instance.IsSystemUser(user)`, which works in shared code and
 * answers false where no server-side source is registered. This constant is for the
 * implementations that have to know the actual value.
 */
export const SystemUserID: string = 'ecafccec-6a37-ef11-86d4-000d3a4e707e';

/**
 * True when this user is the MJ system user. Null/undefined-safe, and case-insensitive because
 * the same UUID arrives with different casing depending on its source (a client-minted
 * lowercase value vs. an uppercase one loaded from SQL Server).
 */
export function IsSystemUser(user: UserInfo | null | undefined): boolean {
    return !!user?.ID && UUIDsEqual(user.ID, SystemUserID);
}
