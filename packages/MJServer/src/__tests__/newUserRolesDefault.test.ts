/**
 * Config-contract regression test for the shipped `userHandling.newUserRoles` default (issue #4260).
 *
 * THE DEFECT. `DEFAULT_SERVER_CONFIG` shipped `newUserRoles: ['UI', 'Developer']`. On the baseline
 * seed the `Developer` role holds `CanUpdate` on 439 of the database's 446 entities with no row-level filter —
 * `MJ: Users` among them, where `AllowUpdateAPI` is true and both `Type` and `Name` are
 * `AllowUpdateAPI` fields. Every gate in the chain passes:
 *
 *   config default -> newUsers.ts assigns the role -> EntityPermission grants Update
 *   -> Entity/Field AllowUpdateAPI allow it -> BaseEntity.CheckPermissions passes
 *   -> GRANT EXECUTE ON __mj.spUpdateUser TO cdp_Developer
 *
 * So anyone who obtained an account through JWT auto-provisioning or a magic-link redeem could
 * write any row of `MJ: Users` — including setting their own `Type` to `'Owner'`, the column MJ's
 * superuser checks read (`SqlLoggingConfigResolver`, `canIssueInvites`, the backup-system-user
 * fallback). That is privilege escalation from "can obtain a token" to "platform Owner".
 *
 * WHY THE DEFAULT IS THE FIX. The value is not merely the fallback for a host with no config file.
 * `loadConfig()` deep-merges through `mergeConfigs`, so a host writing a PARTIAL `userHandling`
 * block (`{ autoCreateNewUsers: true }`, say) inherits this array — the Zod `.default([])` on the
 * schema never fires, because the key is never absent after the merge. The shipped default is
 * therefore the effective posture of every deployment that does not name `newUserRoles` explicitly.
 *
 * These assertions pin the CONTRACT, not just the literal: the shipped default must grant an
 * auto-provisioned user no more than the end-user surface.
 */
import { describe, it, expect, vi } from 'vitest';

// config.ts evaluates `configInfo = loadConfig()` at module load, and `loadConfig` rejects a
// configuration carrying no database credentials. Stubbing the cosmiconfig search — and ONLY that —
// supplies them so the module imports, while leaving `DEFAULT_SERVER_CONFIG` itself completely
// untouched. These assertions therefore run against the constant the server actually ships rather
// than against a copy of it, which is the whole point of a shipped-default contract test.
vi.mock('cosmiconfig', () => ({
  cosmiconfigSync: () => ({
    search: () => ({
      filepath: '/test/mj.config.cjs',
      isEmpty: false,
      config: { dbUsername: 'test-user', dbPassword: 'test-password', dbDatabase: 'test-db' },
    }),
  }),
}));

import { DEFAULT_SERVER_CONFIG } from '../config.js';

/**
 * Seeded roles that carry platform-wide write on the baseline database, and so must never appear
 * in a default handed to a party the host has not vetted. `Integration`'s own seed Description
 * says it "shouldn't be applied to end-users"; `Developer` is the role this issue was filed about.
 */
const PLATFORM_WRITE_ROLES = ['Developer', 'Integration'];

describe('DEFAULT_SERVER_CONFIG.userHandling.newUserRoles (issue #4260)', () => {
  const newUserRoles = DEFAULT_SERVER_CONFIG.userHandling?.newUserRoles;

  it('grants auto-provisioned users the end-user role only', () => {
    expect(newUserRoles).toEqual(['UI']);
  });

  it.each(PLATFORM_WRITE_ROLES)('does not include the platform-write role %j', role => {
    // The regression itself. Before the fix, 'Developer' was present here and every
    // auto-provisioned user could UPDATE MJ: Users, Type and Name included.
    expect(newUserRoles).not.toContain(role);
  });

  it('is not empty — an auto-provisioned user must still be able to use the product', () => {
    // The opposite failure mode: locking the default down to [] would provision users who
    // cannot read their own conversations, views or dashboards. 'UI' is the seeded role that
    // carries exactly that end-user surface (48 update grants, none of them on MJ: Users).
    expect(newUserRoles?.length).toBeGreaterThan(0);
  });

  it('stays minimal because auto-provisioning is ON by default with no domain restriction', () => {
    // This is the linkage that makes the role list security-relevant rather than a convenience
    // setting. A stock server auto-creates an account for ANY identity its configured IdP will
    // issue a token for. If either of these defaults is ever tightened, the role list may be
    // reconsidered — but not before, and never in the other order.
    expect(DEFAULT_SERVER_CONFIG.userHandling?.autoCreateNewUsers).toBe(true);
    expect(DEFAULT_SERVER_CONFIG.userHandling?.newUserLimitedToAuthorizedDomains).toBe(false);
  });
});
