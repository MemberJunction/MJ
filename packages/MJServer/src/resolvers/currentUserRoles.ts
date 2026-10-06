import { LogError } from '@memberjunction/core';

/**
 * Guards and filter builders for CurrentUser role loading.
 * Kept out of UserResolver so the login-adjacent failure modes are unit-testable
 * without importing generated GraphQL types or the Apollo config bootstrap.
 */

export function RequireLoadedUser<T extends { ID?: string }>(
  user: T | null | undefined,
  email: string | undefined,
): T & { ID: string } {
  if (!user?.ID) {
    throw new Error(`CurrentUser: no user found for email '${email ?? ''}'`);
  }
  return user as T & { ID: string };
}

export function RequireContextUser<T>(user: T | null | undefined): T {
  if (!user) {
    throw new Error('CurrentUser: authenticated context user is required to load roles');
  }
  return user;
}

export function RequireRoleProvider<T>(provider: T | null | undefined): T {
  if (!provider) {
    throw new Error('CurrentUser: no data provider available to load roles');
  }
  return provider;
}

/** Quote-escape a server-resolved user id for an ExtraFilter literal. */
export function UserIdExtraFilter(userId: string): string {
  return `UserID='${userId.replace(/'/g, "''")}'`;
}

export function AssertRoleLoadSucceeded(
  result: { Success: boolean; ErrorMessage?: string | null },
  userId: string,
): void {
  if (!result.Success) {
    const message = result.ErrorMessage ?? 'unknown error';
    LogError(`CurrentUser: failed to load roles for user ${userId}: ${message}`);
    throw new Error(`CurrentUser: failed to load roles: ${message}`);
  }
}
