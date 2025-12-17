/**
 * CategoryBuilder - Builds QueryCategoryInfo from configuration and entity groups
 *
 * Centralizes the logic for determining what categories should be created
 * for queries based on the QueryGen configuration.
 */

import { QueryCategoryInfo, EntityGroup } from '../data/schema';
import { QueryGenConfig } from '../cli/config';

/**
 * Build category information for a query based on configuration
 *
 * @param config - QueryGen configuration
 * @param entityGroup - Entity group for the query
 * @returns QueryCategoryInfo with full category details
 */
export function buildQueryCategory(
  config: QueryGenConfig,
  entityGroup: EntityGroup
): QueryCategoryInfo {
  const rootCategoryName = config.rootQueryCategory || 'Auto-Generated';

  if (config.autoCreateEntityQueryCategories) {
    // Create entity-specific category under root
    const entityName = entityGroup?.primaryEntity?.Name;

    if (!entityName) {
      console.warn('buildQueryCategory: primaryEntity.Name is undefined, falling back to root category');
      return {
        name: rootCategoryName,
        parentName: null,
        description: 'Automatically generated queries from query-gen tool',
        path: rootCategoryName
      };
    }

    return {
      name: entityName,
      parentName: rootCategoryName,
      description: `Queries for the ${entityName} entity`,
      path: `${rootCategoryName}/${entityName}`
    };
  } else {
    // Use root category only
    return {
      name: rootCategoryName,
      parentName: null,
      description: 'Automatically generated queries from query-gen tool',
      path: rootCategoryName
    };
  }
}

/**
 * Extract all unique categories from validated queries
 * Returns categories in hierarchical order (root first, then children)
 *
 * IMPORTANT: Also creates parent categories for any child categories
 * (e.g., if "Golden-Queries/Members" is provided, also creates "Golden-Queries")
 *
 * @param categories - Array of QueryCategoryInfo from validated queries
 * @returns Unique categories sorted hierarchically (includes auto-generated parents)
 */
export function extractUniqueCategories(categories: QueryCategoryInfo[]): QueryCategoryInfo[] {
  const uniqueMap = new Map<string, QueryCategoryInfo>();

  // Collect all unique categories (by path)
  for (const cat of categories) {
    if (!uniqueMap.has(cat.path)) {
      uniqueMap.set(cat.path, cat);
    }

    // If this is a child category, ensure parent category exists
    if (cat.parentName && !uniqueMap.has(cat.parentName)) {
      uniqueMap.set(cat.parentName, {
        name: cat.parentName,
        parentName: null,
        description: 'Automatically generated queries from query-gen tool',
        path: cat.parentName
      });
    }
  }

  // Convert to array and sort: root categories first, then children
  const result = Array.from(uniqueMap.values());
  result.sort((a, b) => {
    // Root categories (no parent) come first
    if (a.parentName === null && b.parentName !== null) return -1;
    if (a.parentName !== null && b.parentName === null) return 1;

    // Then sort alphabetically by path
    return a.path.localeCompare(b.path);
  });

  return result;
}
