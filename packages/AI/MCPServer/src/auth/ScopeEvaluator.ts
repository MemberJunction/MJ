/**
 * @fileoverview Scope Evaluator for OAuth Authorization
 *
 * Provides helper methods for tools to evaluate scopes from JWT claims.
 * This module enables scope-based access control for MCP tools.
 *
 * @module @memberjunction/ai-mcp-server/auth/ScopeEvaluator
 */

/**
 * Scope evaluator for checking granted permissions.
 * Used by tools to verify the authenticated user has required scopes.
 */
export class ScopeEvaluator {
  private readonly scopes: Set<string>;

  /** Scope name that acts as a wildcard granting all permissions. */
  private static readonly FULL_ACCESS_SCOPE = 'full_access';

  /**
   * Creates a new ScopeEvaluator with the given granted scopes.
   *
   * @param grantedScopes - Array of scope names granted to the user
   */
  constructor(grantedScopes: string[]) {
    this.scopes = new Set(grantedScopes);
  }

  /**
   * Checks if the user was granted full access (the `full_access` wildcard scope).
   *
   * @returns true if `full_access` is in the granted scopes
   */
  get HasFullAccess(): boolean {
    return this.scopes.has(ScopeEvaluator.FULL_ACCESS_SCOPE);
  }

  /**
   * Checks if a specific scope is granted.
   * Returns true for any scope if `full_access` was granted.
   *
   * @param scope - The scope name to check (e.g., "entity:read")
   * @returns true if the scope is granted
   *
   * @example
   * ```typescript
   * const evaluator = new ScopeEvaluator(['entity:read', 'entity:write']);
   * evaluator.hasScope('entity:read');  // true
   * evaluator.hasScope('action:execute');  // false
   *
   * const fullAccess = new ScopeEvaluator(['full_access']);
   * fullAccess.hasScope('entity:read');  // true (full_access is a wildcard)
   * ```
   */
  HasScope(scope: string): boolean {
    if (this.HasFullAccess) return true;
    return this.scopes.has(scope);
  }

  /** @deprecated Use {@link HasScope}. */
  hasScope(scope: string): boolean {
    return this.HasScope(scope);
  }

  /**
   * Checks if any of the specified scopes is granted.
   * Returns true for any check if `full_access` was granted.
   *
   * @param scopes - Array of scope names to check
   * @returns true if at least one scope is granted
   *
   * @example
   * ```typescript
   * const evaluator = new ScopeEvaluator(['entity:read']);
   * evaluator.hasAnyScope(['entity:read', 'entity:write']);  // true
   * evaluator.hasAnyScope(['action:execute', 'agent:run']);  // false
   * ```
   */
  HasAnyScope(scopes: string[]): boolean {
    if (this.HasFullAccess) return true;
    return scopes.some((scope) => this.scopes.has(scope));
  }

  /** @deprecated Use {@link HasAnyScope}. */
  hasAnyScope(scopes: string[]): boolean {
    return this.HasAnyScope(scopes);
  }

  /**
   * Checks if all specified scopes are granted.
   * Returns true for any check if `full_access` was granted.
   *
   * @param scopes - Array of scope names to check
   * @returns true if all scopes are granted
   *
   * @example
   * ```typescript
   * const evaluator = new ScopeEvaluator(['entity:read', 'entity:write']);
   * evaluator.hasAllScopes(['entity:read', 'entity:write']);  // true
   * evaluator.hasAllScopes(['entity:read', 'action:execute']);  // false
   * ```
   */
  HasAllScopes(scopes: string[]): boolean {
    if (this.HasFullAccess) return true;
    return scopes.every((scope) => this.scopes.has(scope));
  }

  /** @deprecated Use {@link HasAllScopes}. */
  hasAllScopes(scopes: string[]): boolean {
    return this.HasAllScopes(scopes);
  }

  /**
   * Gets all granted scopes.
   *
   * @returns Array of granted scope names
   */
  GetScopes(): string[] {
    return Array.from(this.scopes);
  }

  /** @deprecated Use {@link GetScopes}. */
  getScopes(): string[] {
    return this.GetScopes();
  }

  /**
   * Gets scopes matching a pattern.
   * Supports glob-style wildcards: `*` matches any characters.
   *
   * @param pattern - Scope pattern with optional wildcards (e.g., "entity:*")
   * @returns Array of matching scope names
   *
   * @example
   * ```typescript
   * const evaluator = new ScopeEvaluator(['entity:read', 'entity:write', 'action:execute']);
   * evaluator.getScopesMatching('entity:*');  // ['entity:read', 'entity:write']
   * evaluator.getScopesMatching('*:read');    // ['entity:read']
   * ```
   */
  GetScopesMatching(pattern: string): string[] {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape regex special chars
      .replace(/\*/g, '.*');                  // Convert * to .*
    const regex = new RegExp(`^${regexPattern}$`);

    return this.GetScopes().filter((scope) => regex.test(scope));
  }

  /** @deprecated Use {@link GetScopesMatching}. */
  getScopesMatching(pattern: string): string[] {
    return this.GetScopesMatching(pattern);
  }

  /**
   * Checks if the evaluator has no scopes (empty).
   *
   * @returns true if no scopes are granted
   */
  IsEmpty(): boolean {
    return this.scopes.size === 0;
  }

  /** @deprecated Use {@link IsEmpty}. */
  isEmpty(): boolean {
    return this.IsEmpty();
  }

  /**
   * Gets the count of granted scopes.
   *
   * @returns Number of granted scopes
   */
  get Count(): number {
    return this.scopes.size;
  }

  /** @deprecated Use {@link Count}. */
  get count(): number {
    return this.Count;
  }
}

/**
 * Creates a ScopeEvaluator from a JWT claims object.
 *
 * @param claims - JWT claims containing a 'scopes' array
 * @returns ScopeEvaluator instance
 *
 * @example
 * ```typescript
 * const jwt = { scopes: ['entity:read', 'action:execute'], ... };
 * const evaluator = createScopeEvaluator(jwt);
 * if (!evaluator.hasScope('entity:write')) {
 *   throw new Error('Permission denied: entity:write scope required');
 * }
 * ```
 */
export function CreateScopeEvaluator(claims: { scopes?: string[] }): ScopeEvaluator {
  return new ScopeEvaluator(claims.scopes ?? []);
}

/** @deprecated Use {@link CreateScopeEvaluator}. */
export function createScopeEvaluator(claims: { scopes?: string[] }): ScopeEvaluator {
  return CreateScopeEvaluator(claims);
}

/**
 * Checks if a specific scope is present in a claims object.
 * Convenience function for simple scope checks without creating an evaluator.
 * Recognizes `full_access` as a wildcard that grants all scopes.
 *
 * @param claims - JWT claims containing a 'scopes' array
 * @param scope - The scope name to check
 * @returns true if the scope is granted
 */
export function CheckScope(claims: { scopes?: string[] }, scope: string): boolean {
  if (!claims.scopes) return false;
  if (claims.scopes.includes('full_access')) return true;
  return claims.scopes.includes(scope);
}

/** @deprecated Use {@link CheckScope}. */
export function checkScope(claims: { scopes?: string[] }, scope: string): boolean {
  return CheckScope(claims, scope);
}

/**
 * Checks if any of the specified scopes are present in a claims object.
 * Convenience function for simple scope checks without creating an evaluator.
 * Recognizes `full_access` as a wildcard that grants all scopes.
 *
 * @param claims - JWT claims containing a 'scopes' array
 * @param scopes - The scope names to check
 * @returns true if any scope is granted
 */
export function CheckAnyScope(claims: { scopes?: string[] }, scopes: string[]): boolean {
  if (!claims.scopes) return false;
  if (claims.scopes.includes('full_access')) return true;
  return scopes.some((scope) => claims.scopes!.includes(scope));
}

/** @deprecated Use {@link CheckAnyScope}. */
export function checkAnyScope(claims: { scopes?: string[] }, scopes: string[]): boolean {
  return CheckAnyScope(claims, scopes);
}

/**
 * Checks if all specified scopes are present in a claims object.
 * Convenience function for simple scope checks without creating an evaluator.
 * Recognizes `full_access` as a wildcard that grants all scopes.
 *
 * @param claims - JWT claims containing a 'scopes' array
 * @param scopes - The scope names to check
 * @returns true if all scopes are granted
 */
export function CheckAllScopes(claims: { scopes?: string[] }, scopes: string[]): boolean {
  if (!claims.scopes) return false;
  if (claims.scopes.includes('full_access')) return true;
  return scopes.every((scope) => claims.scopes!.includes(scope));
}

/** @deprecated Use {@link CheckAllScopes}. */
export function checkAllScopes(claims: { scopes?: string[] }, scopes: string[]): boolean {
  return CheckAllScopes(claims, scopes);
}
