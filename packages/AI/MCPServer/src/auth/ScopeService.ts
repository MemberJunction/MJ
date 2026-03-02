/**
 * @fileoverview Scope Service for OAuth Authorization
 *
 * Loads and manages API scopes from the __mj.APIScope entity.
 * Scopes are used for consent screens and token authorization.
 *
 * @module @memberjunction/ai-mcp-server/auth/ScopeService
 */

import { RunView } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { getSystemUser } from '@memberjunction/server';
import type { APIScopeInfo, ScopeUIConfig } from './types.js';

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
      FullPath: string;
      ParentID: string | null;
      Category: string;
      Description: string;
      IsActive: boolean;
      UIConfig: string | null;
    }>(
      {
        EntityName: 'MJ: API Scopes',
        ExtraFilter: 'IsActive = 1',
        OrderBy: 'Category, FullPath',
        ResultType: 'simple',
      },
      systemUser
    );

    if (!result.Success) {
      console.error('[ScopeService] Failed to load scopes:', result.ErrorMessage);
      return scopeCache ?? [];
    }

    const scopes: APIScopeInfo[] = result.Results.map((row) => {
      let uiConfig: ScopeUIConfig | undefined;
      if (row.UIConfig) {
        try {
          uiConfig = JSON.parse(row.UIConfig) as ScopeUIConfig;
        } catch {
          // Ignore parse errors
        }
      }
      return {
        ID: row.ID,
        Name: row.Name,
        FullPath: row.FullPath ?? row.Name,
        ParentID: row.ParentID,
        Category: row.Category ?? 'General',
        Description: row.Description ?? row.Name,
        IsActive: row.IsActive,
        UIConfig: uiConfig,
      };
    });

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
  return scopes.map((s) => s.FullPath);
}

/**
 * Represents a scope with its children in a tree structure.
 */
export interface ScopeTreeNode {
  scope: APIScopeInfo;
  children: ScopeTreeNode[];
}

/**
 * Represents a group of scopes under a parent scope prefix.
 */
export interface ScopePrefixGroup {
  /** The parent scope (null if scopes have no common parent) */
  parent: APIScopeInfo | null;
  /** Child scopes under this parent */
  children: APIScopeInfo[];
}

/**
 * Hierarchical grouping of scopes by category and prefix.
 */
export interface HierarchicalScopeGroups {
  /** The full_access scope if present (special treatment) */
  fullAccessScope: APIScopeInfo | null;
  /** Categories with their prefix groups */
  categories: Map<string, ScopePrefixGroup[]>;
}

/**
 * Groups scopes hierarchically by category and then by parent scope prefix.
 *
 * This creates a two-level hierarchy:
 * 1. First level: Category (e.g., "Entities", "Agents")
 * 2. Second level: Parent scope prefix (e.g., "entity", "agent")
 *
 * The full_access scope is extracted separately for special UI treatment.
 *
 * @param scopes - Array of scope info to group
 * @returns Hierarchical grouping with full_access separated
 */
export function groupScopesHierarchically(scopes: APIScopeInfo[]): HierarchicalScopeGroups {
  // Extract full_access scope for special treatment
  const fullAccessScope = scopes.find((s) => s.FullPath === 'full_access') ?? null;
  const remainingScopes = scopes.filter((s) => s.FullPath !== 'full_access');

  // Build a map of ID -> scope for parent lookups
  const scopeById = new Map<string, APIScopeInfo>();
  for (const scope of remainingScopes) {
    scopeById.set(scope.ID, scope);
  }

  // Group by category first
  const byCategory = new Map<string, APIScopeInfo[]>();
  for (const scope of remainingScopes) {
    const category = scope.Category || 'General';
    const existing = byCategory.get(category) ?? [];
    existing.push(scope);
    byCategory.set(category, existing);
  }

  // Within each category, group by parent scope
  const categories = new Map<string, ScopePrefixGroup[]>();

  for (const [category, categoryScopes] of byCategory) {
    const prefixGroups: ScopePrefixGroup[] = [];

    // Find root scopes (no parent) and scopes with parents
    const rootScopes = categoryScopes.filter((s) => !s.ParentID);
    const childScopes = categoryScopes.filter((s) => s.ParentID);

    // Group children by their parent
    const childrenByParent = new Map<string, APIScopeInfo[]>();
    for (const child of childScopes) {
      if (child.ParentID) {
        const existing = childrenByParent.get(child.ParentID) ?? [];
        existing.push(child);
        childrenByParent.set(child.ParentID, existing);
      }
    }

    // Create prefix groups for each root scope
    for (const rootScope of rootScopes) {
      const children = childrenByParent.get(rootScope.ID) ?? [];
      prefixGroups.push({
        parent: rootScope,
        children: children.sort((a, b) => a.FullPath.localeCompare(b.FullPath)),
      });
    }

    // Handle any orphaned scopes (parent not in same category or not found)
    const orphanedScopes = childScopes.filter((s) => {
      if (!s.ParentID) return false;
      const parent = scopeById.get(s.ParentID);
      // Orphaned if parent doesn't exist or is in a different category
      return !parent || parent.Category !== category;
    });

    if (orphanedScopes.length > 0) {
      prefixGroups.push({
        parent: null,
        children: orphanedScopes.sort((a, b) => a.FullPath.localeCompare(b.FullPath)),
      });
    }

    // Sort prefix groups by parent name (null groups at end)
    prefixGroups.sort((a, b) => {
      if (!a.parent && !b.parent) return 0;
      if (!a.parent) return 1;
      if (!b.parent) return -1;
      return a.parent.FullPath.localeCompare(b.parent.FullPath);
    });

    categories.set(category, prefixGroups);
  }

  return {
    fullAccessScope,
    categories,
  };
}

/**
 * Gets all child scope FullPaths for a given parent scope.
 * Used to determine which scopes are implied when a parent is selected.
 *
 * @param parentFullPath - The parent scope's FullPath
 * @param scopes - All available scopes
 * @returns Array of child scope FullPaths
 */
export function getChildScopeFullPaths(parentFullPath: string, scopes: APIScopeInfo[]): string[] {
  const parent = scopes.find((s) => s.FullPath === parentFullPath);
  if (!parent) return [];

  return scopes
    .filter((s) => UUIDsEqual(s.ParentID, parent.ID))
    .map((s) => s.FullPath);
}
