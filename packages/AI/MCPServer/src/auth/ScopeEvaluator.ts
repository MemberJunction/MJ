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

  /**
   * Creates a new ScopeEvaluator with the given granted scopes.
   *
   * @param grantedScopes - Array of scope names granted to the user
   */
  constructor(grantedScopes: string[]) {
    this.scopes = new Set(grantedScopes);
  }

  /**
   * Checks if a specific scope is granted.
   *
   * @param scope - The scope name to check (e.g., "entity:read")
   * @returns true if the scope is granted
   *
   * @example
   * ```typescript
   * const evaluator = new ScopeEvaluator(['entity:read', 'entity:write']);
   * evaluator.hasScope('entity:read');  // true
   * evaluator.hasScope('action:execute');  // false
   * ```
   */
  hasScope(scope: string): boolean {
    return this.scopes.has(scope);
  }

  /**
   * Checks if any of the specified scopes is granted.
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
  hasAnyScope(scopes: string[]): boolean {
    return scopes.some((scope) => this.scopes.has(scope));
  }

  /**
   * Checks if all specified scopes are granted.
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
  hasAllScopes(scopes: string[]): boolean {
    return scopes.every((scope) => this.scopes.has(scope));
  }

  /**
   * Gets all granted scopes.
   *
   * @returns Array of granted scope names
   */
  getScopes(): string[] {
    return Array.from(this.scopes);
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
  getScopesMatching(pattern: string): string[] {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape regex special chars
      .replace(/\*/g, '.*');                  // Convert * to .*
    const regex = new RegExp(`^${regexPattern}$`);

    return this.getScopes().filter((scope) => regex.test(scope));
  }

  /**
   * Checks if the evaluator has no scopes (empty).
   *
   * @returns true if no scopes are granted
   */
  isEmpty(): boolean {
    return this.scopes.size === 0;
  }

  /**
   * Gets the count of granted scopes.
   *
   * @returns Number of granted scopes
   */
  get count(): number {
    return this.scopes.size;
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
export function createScopeEvaluator(claims: { scopes?: string[] }): ScopeEvaluator {
  return new ScopeEvaluator(claims.scopes ?? []);
}

/**
 * Checks if a specific scope is present in a claims object.
 * Convenience function for simple scope checks without creating an evaluator.
 *
 * @param claims - JWT claims containing a 'scopes' array
 * @param scope - The scope name to check
 * @returns true if the scope is granted
 */
export function checkScope(claims: { scopes?: string[] }, scope: string): boolean {
  return claims.scopes?.includes(scope) ?? false;
}

/**
 * Checks if any of the specified scopes are present in a claims object.
 * Convenience function for simple scope checks without creating an evaluator.
 *
 * @param claims - JWT claims containing a 'scopes' array
 * @param scopes - The scope names to check
 * @returns true if any scope is granted
 */
export function checkAnyScope(claims: { scopes?: string[] }, scopes: string[]): boolean {
  if (!claims.scopes) return false;
  return scopes.some((scope) => claims.scopes!.includes(scope));
}

/**
 * Checks if all specified scopes are present in a claims object.
 * Convenience function for simple scope checks without creating an evaluator.
 *
 * @param claims - JWT claims containing a 'scopes' array
 * @param scopes - The scope names to check
 * @returns true if all scopes are granted
 */
export function checkAllScopes(claims: { scopes?: string[] }, scopes: string[]): boolean {
  if (!claims.scopes) return false;
  return scopes.every((scope) => claims.scopes!.includes(scope));
}
