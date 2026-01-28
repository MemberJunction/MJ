/**
 * @fileoverview Scope Service for OAuth Authorization
 *
 * Loads and manages API scopes from the __mj.APIScope entity.
 * Scopes are used for consent screens and token authorization.
 *
 * @module @memberjunction/ai-mcp-server/auth/ScopeService
 */

import { RunView } from '@memberjunction/core';
import { getSystemUser } from '@memberjunction/server';
import type { APIScopeInfo } from './types.js';

/**
 * In-memory cache for scopes to avoid repeated database queries.
 */
let scopeCache: APIScopeInfo[] | null = null;
let scopeCacheExpiry: number = 0;
const SCOPE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Loads all active scopes from the __mj.APIScope entity.
 *
 * This function queries the database for all active API scopes and returns
 * them in a format suitable for consent screens and scope validation.
 *
 * Results are cached for 5 minutes to reduce database load.
 *
 * @returns Array of active scope information
 *
 * @example
 * ```typescript
 * const scopes = await loadActiveScopes();
 * console.log(scopes);
 * // [
 * //   { ID: '...', Name: 'entity:read', Category: 'Entities', Description: 'Read entity records', IsActive: true },
 * //   { ID: '...', Name: 'entity:write', Category: 'Entities', Description: 'Create and update records', IsActive: true },
 * // ]
 * ```
 */
export async function loadActiveScopes(): Promise<APIScopeInfo[]> {
  // Check cache
  const now = Date.now();
  if (scopeCache && now < scopeCacheExpiry) {
    return scopeCache;
  }

  try {
    // Get system user for server-side operations
    const systemUser = await getSystemUser();

    const rv = new RunView();
    const result = await rv.RunView<{
      ID: string;
      Name: string;
      Category: string;
      Description: string;
      IsActive: boolean;
    }>(
      {
        EntityName: 'MJ: API Scopes',
        ExtraFilter: 'IsActive = 1',
        OrderBy: 'Category, Name',
        ResultType: 'simple',
      },
      systemUser
    );

    if (!result.Success) {
      console.error('[ScopeService] Failed to load scopes:', result.ErrorMessage);
      return scopeCache ?? [];
    }

    const scopes: APIScopeInfo[] = result.Results.map((row) => ({
      ID: row.ID,
      Name: row.Name,
      Category: row.Category ?? 'General',
      Description: row.Description ?? row.Name,
      IsActive: row.IsActive,
    }));

    // Update cache
    scopeCache = scopes;
    scopeCacheExpiry = now + SCOPE_CACHE_TTL_MS;

    console.log(`[ScopeService] Loaded ${scopes.length} active scopes`);
    return scopes;
  } catch (error) {
    console.error('[ScopeService] Error loading scopes:', error);
    return scopeCache ?? [];
  }
}

/**
 * Clears the scope cache, forcing a refresh on next load.
 * Useful for testing or after administrative changes to scopes.
 */
export function clearScopeCache(): void {
  scopeCache = null;
  scopeCacheExpiry = 0;
}

/**
 * Gets a scope by name from the cached scopes.
 *
 * @param name - The scope name to find (e.g., "entity:read")
 * @returns The scope info if found, undefined otherwise
 */
export async function getScopeByName(name: string): Promise<APIScopeInfo | undefined> {
  const scopes = await loadActiveScopes();
  return scopes.find((s) => s.Name === name);
}

/**
 * Validates that all requested scope names exist and are active.
 *
 * @param requestedScopes - Array of scope names to validate
 * @returns Object with valid flag and arrays of valid/invalid scopes
 */
export async function validateScopes(requestedScopes: string[]): Promise<{
  valid: boolean;
  validScopes: string[];
  invalidScopes: string[];
}> {
  const availableScopes = await loadActiveScopes();
  const availableScopeNames = new Set(availableScopes.map((s) => s.Name));

  const validScopes: string[] = [];
  const invalidScopes: string[] = [];

  for (const scope of requestedScopes) {
    if (availableScopeNames.has(scope)) {
      validScopes.push(scope);
    } else {
      invalidScopes.push(scope);
    }
  }

  return {
    valid: invalidScopes.length === 0,
    validScopes,
    invalidScopes,
  };
}

/**
 * Groups scopes by category for display on consent screens.
 *
 * @param scopes - Array of scope info to group
 * @returns Map of category name to scopes in that category
 */
export function groupScopesByCategory(
  scopes: APIScopeInfo[]
): Map<string, APIScopeInfo[]> {
  const grouped = new Map<string, APIScopeInfo[]>();

  for (const scope of scopes) {
    const category = scope.Category || 'General';
    const existing = grouped.get(category) ?? [];
    existing.push(scope);
    grouped.set(category, existing);
  }

  return grouped;
}

/**
 * Gets default scopes to use when no specific scopes are requested.
 * Returns all active scopes by default.
 *
 * @returns Array of default scope names
 */
export async function getDefaultScopes(): Promise<string[]> {
  const scopes = await loadActiveScopes();
  return scopes.map((s) => s.Name);
}
