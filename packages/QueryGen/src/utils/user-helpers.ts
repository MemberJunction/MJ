/**
 * User helper utilities for QueryGen CLI operations
 */

import { UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';

/**
 * Get the system user from UserCache
 *
 * The System user is populated in the UserCache when the database provider is initialized.
 * This user is used for CLI operations where no specific user context exists.
 *
 * @returns The System UserInfo object from the cache
 * @throws Error if System user is not found in cache or doesn't have Developer role
 */
export function getSystemUser(): UserInfo {
  const sysUser = UserCache.Instance.UserByName("System", false);
  if (!sysUser) {
    throw new Error(
      "System user not found in cache. Ensure the database provider is initialized " +
      "before running QueryGen commands (e.g., via 'mj querygen' which initializes the provider)."
    );
  }

  // Check if the System user has the Developer role
  const hasDeveloperRole = sysUser.UserRoles && sysUser.UserRoles.some(
    userRole => userRole.Role.trim().toLowerCase() === 'developer'
  );

  if (!hasDeveloperRole) {
    throw new Error(
      "System user does not have the 'Developer' role. " +
      "The System user must have the Developer role to perform QueryGen operations."
    );
  }

  return sysUser;
}
