import { BaseEntity, CompositeKey, EntityInfo, Metadata } from '@memberjunction/core';

/**
 * Represents a descendant entity discovered in an IS-A hierarchy.
 * Used by UI components to render hierarchical IS-A relationship displays.
 *
 * This is a **UI-level data structure** — BaseEntity does not use this.
 */
export interface IsaDescendantInfo {
  /** The entity name (e.g., "Members", "Gold Members") */
  EntityName: string;
  /** Depth relative to the starting entity (0 = direct child, 1 = grandchild, etc.) */
  Depth: number;
  /** The immediate parent entity name in the IS-A chain */
  ParentEntityName: string;
}

/**
 * Represents one related IS-A entity to display in the panel.
 * Supports a tree structure via `Children` for nested sub-card rendering.
 */
export interface IsaRelatedItem {
  /** The entity name (e.g., "Members", "Speakers") */
  EntityName: string;
  /** Relationship to the current form's entity */
  Relationship: 'sibling' | 'child';
  /** Depth in the IS-A hierarchy relative to the form's entity (0 = direct, 1 = grandchild, etc.) */
  Depth: number;
  /** Child items nested under this entity in the IS-A hierarchy */
  Children: IsaRelatedItem[];
}

/**
 * Builds a tree of `IsaRelatedItem` from a flat depth-first ordered list of
 * `IsaDescendantInfo`. Depth-0 items become roots; deeper items are nested
 * under their `ParentEntityName` match.
 *
 * @param descendants - Flat depth-first list from `DiscoverISADescendants`
 * @returns Root-level items with nested `Children` arrays
 */
export function BuildDescendantTree(descendants: IsaDescendantInfo[]): IsaRelatedItem[] {
  const rootItems: IsaRelatedItem[] = [];
  const itemMap = new Map<string, IsaRelatedItem>();

  for (const desc of descendants) {
    const item: IsaRelatedItem = {
      EntityName: desc.EntityName,
      Relationship: 'child',
      Depth: desc.Depth,
      Children: []
    };
    itemMap.set(desc.EntityName, item);

    if (desc.Depth === 0) {
      rootItems.push(item);
    } else {
      const parent = itemMap.get(desc.ParentEntityName);
      if (parent) {
        parent.Children.push(item);
      } else {
        rootItems.push(item);
      }
    }
  }

  return rootItems;
}

/** Maximum recursion depth to prevent runaway walks in malformed hierarchies */
const MAX_DEPTH = 10;

/**
 * Recursively discovers all IS-A descendant entities that have records
 * matching the given record's primary key.
 *
 * **This is a UI-level utility method.** It does NOT modify BaseEntity's
 * automatic loading behavior or participate in entity lifecycle management.
 * It creates temporary entity instances solely to discover deeper hierarchy
 * levels via the existing provider infrastructure.
 *
 * Intended for use by UI components (e.g., `<mj-isa-related-panel>`) that
 * need to display the full IS-A descendant tree with depth information.
 *
 * For disjoint subtypes, leverages the auto-chained `ISAChild` property
 * (already loaded during the parent entity's load). For overlapping subtypes,
 * loads child entities individually to discover their own children.
 *
 * @param record - The already-loaded parent entity record to discover descendants for.
 *                 Its `ISAChild`/`ISAChildren` properties must already be populated
 *                 (this happens automatically during entity load).
 * @returns Flat list of descendant entities ordered depth-first, with depth information.
 *          Returns empty array if the entity has no children.
 */
export async function DiscoverISADescendants(
  record: BaseEntity
): Promise<IsaDescendantInfo[]> {
  const entityInfo = record.EntityInfo;
  if (!entityInfo?.IsParentType) return [];

  const md = new Metadata();
  const results: IsaDescendantInfo[] = [];
  const visited = new Set<string>([entityInfo.Name]);

  await walkDescendants(md, record, entityInfo, record.PrimaryKey, 0, results, visited);
  return results;
}

/**
 * Internal recursive walker. Examines the given loaded entity's children
 * and recurses into any child that is itself a parent type.
 */
async function walkDescendants(
  md: Metadata,
  loadedEntity: BaseEntity,
  parentInfo: EntityInfo,
  primaryKey: CompositeKey,
  depth: number,
  results: IsaDescendantInfo[],
  visited: Set<string>
): Promise<void> {
  if (depth >= MAX_DEPTH) return;

  if (parentInfo.AllowMultipleSubtypes) {
    await walkOverlappingChildren(md, loadedEntity, parentInfo, primaryKey, depth, results, visited);
  } else {
    await walkDisjointChain(md, loadedEntity, parentInfo, primaryKey, depth, results, visited);
  }
}

/**
 * Walk overlapping children: `ISAChildren` has entity names only,
 * so we load each child to discover deeper levels.
 */
async function walkOverlappingChildren(
  md: Metadata,
  loadedEntity: BaseEntity,
  parentInfo: EntityInfo,
  primaryKey: CompositeKey,
  depth: number,
  results: IsaDescendantInfo[],
  visited: Set<string>
): Promise<void> {
  const children = loadedEntity.ISAChildren;
  if (!children) return;

  for (const child of children) {
    if (visited.has(child.entityName)) continue;
    visited.add(child.entityName);

    results.push({
      EntityName: child.entityName,
      Depth: depth,
      ParentEntityName: parentInfo.Name
    });

    // Check if this child is also a parent type with its own descendants
    const childInfo = md.EntityByName(child.entityName);
    if (childInfo?.IsParentType) {
      const childEntity = await md.GetEntityObject<BaseEntity>(child.entityName);
      const loaded = await childEntity.InnerLoad(primaryKey);
      if (loaded) {
        await walkDescendants(md, childEntity, childInfo, primaryKey, depth + 1, results, visited);
      }
    }
  }
}

/**
 * Walk disjoint chain: `ISAChild` is already loaded and auto-chained,
 * so we can access it directly. However, any link in the chain might
 * itself be an overlapping parent, requiring async discovery.
 */
async function walkDisjointChain(
  md: Metadata,
  loadedEntity: BaseEntity,
  parentInfo: EntityInfo,
  primaryKey: CompositeKey,
  depth: number,
  results: IsaDescendantInfo[],
  visited: Set<string>
): Promise<void> {
  const child = loadedEntity.ISAChild;
  if (!child) return;

  const childName = child.EntityInfo.Name;
  if (visited.has(childName)) return;
  visited.add(childName);

  results.push({
    EntityName: childName,
    Depth: depth,
    ParentEntityName: parentInfo.Name
  });

  // The disjoint child is already loaded; check if it has its own descendants
  if (child.EntityInfo.IsParentType) {
    await walkDescendants(md, child, child.EntityInfo, primaryKey, depth + 1, results, visited);
  }
}
