/**
 * @module component-resolution
 *
 * The component tree's two pure algorithms:
 *
 * - {@link resolveComponentProfile} — a leaf's full profile, produced by walking `ParentID` up to
 *   the root and folding the chain root→leaf per each property key's fixed merge mode
 *   ({@link PROPERTY_MERGE_MODES}). This is "each node holds what is true of everything below it;
 *   a leaf combines its own lists with its parents'" made executable.
 *
 * - {@link lintComponentTree} — the **principled-partition enforcer**: a property belongs on a
 *   node only if it genuinely holds for all descendants, and the lint makes violations visible
 *   (a `Remove` vetoing an ancestor's `Add` is legal but reported; a child widening a narrowed
 *   set is an error). The shipped seed tree is certified by a test asserting zero
 *   Errors/Warnings; customer trees surface findings in the Studio catalog panel.
 *
 * Pure and dependency-free by design: the server `MLComponentEngine`, unit tests, and the
 * browser Components tab all run this one implementation.
 */

import {
  ComponentKind,
  ComponentPropertyKey,
  ComponentTypeNode,
  ComponentTypePropertyRow,
  ComponentTypeSlotRow,
  PROPERTY_MERGE_MODES,
  ResolvedComponentProfile,
  ResolvedPropertyItem,
  ResolvedSlot,
  TreeLintFinding,
} from './component-model';

/** Hard cap on tree depth — beyond this, resolution throws (a cycle or a degenerate tree). */
const MAX_TREE_DEPTH = 32;

/** Kinds whose concrete (non-abstract) leaves must carry a DriverClass to be executable. */
const DRIVER_REQUIRED_KINDS: ReadonlySet<ComponentKind> = new Set(['Model', 'Preprocessing', 'Input', 'Structure']);

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** Walk `ParentID` from `leafId` to its root. Returns the chain ROOT FIRST. Throws on cycles/depth. */
export function chainToRoot(leafId: string, nodesById: ReadonlyMap<string, ComponentTypeNode>): ComponentTypeNode[] {
  const chain: ComponentTypeNode[] = [];
  const seen = new Set<string>();
  let currentId: string | null = leafId;
  while (currentId != null) {
    if (seen.has(currentId)) {
      throw new Error(`Component-type tree cycle detected at node ${currentId}`);
    }
    if (chain.length >= MAX_TREE_DEPTH) {
      throw new Error(`Component-type chain exceeds MAX_TREE_DEPTH (${MAX_TREE_DEPTH}) at node ${currentId}`);
    }
    const node = nodesById.get(currentId);
    if (!node) {
      throw new Error(`Component-type node ${currentId} not found (dangling ParentID or unknown leaf)`);
    }
    seen.add(currentId);
    chain.push(node);
    currentId = node.ParentID;
  }
  return chain.reverse();
}

/** Parse a stored JSON payload; fall back to the raw string so a bad payload is visible, not lost. */
function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Rows for one node+key, in Sequence order. */
function rowsFor(
  rows: readonly ComponentTypePropertyRow[] | undefined,
  key: ComponentPropertyKey,
): ComponentTypePropertyRow[] {
  return (rows ?? []).filter((r) => r.PropertyKey === key).sort((a, b) => a.Sequence - b.Sequence);
}

/** Fold one `union`-mode key across the chain: Map by ItemKey, insertion-ordered; Remove vetoes. */
function foldUnion(chain: readonly ComponentTypeNode[], byType: PropsByType, key: ComponentPropertyKey): FoldResult {
  const items = new Map<string, ResolvedPropertyItem>();
  const contributors: string[] = [];
  for (const node of chain) {
    for (const row of rowsFor(byType.get(node.ID), key)) {
      const itemKey = row.ItemKey ?? '';
      if (row.Operation === 'Remove') {
        items.delete(itemKey);
      } else {
        items.set(itemKey, toItem(row, node.ID));
      }
      if (!contributors.includes(node.ID)) contributors.push(node.ID);
    }
  }
  return { items: [...items.values()], contributors };
}

/** Fold one `append`-mode key: ordered root→leaf; Replace swaps the inherited item in place. */
function foldAppend(chain: readonly ComponentTypeNode[], byType: PropsByType, key: ComponentPropertyKey): FoldResult {
  const items: ResolvedPropertyItem[] = [];
  const contributors: string[] = [];
  for (const node of chain) {
    for (const row of rowsFor(byType.get(node.ID), key)) {
      if (row.Operation === 'Replace' && row.ItemKey != null) {
        const at = items.findIndex((i) => i.ItemKey === row.ItemKey);
        if (at >= 0) {
          items[at] = toItem(row, node.ID);
        } else {
          items.push(toItem(row, node.ID));
        }
      } else if (row.Operation === 'Remove') {
        const at = items.findIndex((i) => i.ItemKey === row.ItemKey);
        if (at >= 0) items.splice(at, 1);
      } else {
        items.push(toItem(row, node.ID));
      }
      if (!contributors.includes(node.ID)) contributors.push(node.ID);
    }
  }
  return { items, contributors };
}

/** Fold `override`/`narrow`: the deepest node carrying the key wins. */
function foldOverride(chain: readonly ComponentTypeNode[], byType: PropsByType, key: ComponentPropertyKey): FoldResult {
  let winner: ResolvedPropertyItem | null = null;
  const contributors: string[] = [];
  for (const node of chain) {
    for (const row of rowsFor(byType.get(node.ID), key)) {
      winner = toItem(row, node.ID);
      if (!contributors.includes(node.ID)) contributors.push(node.ID);
    }
  }
  return { items: winner ? [winner] : [], contributors };
}

/** Fold `mergeObject`: shallow object merge root→leaf; non-object payloads override wholesale. */
function foldMergeObject(chain: readonly ComponentTypeNode[], byType: PropsByType, key: ComponentPropertyKey): FoldResult {
  let merged: Record<string, unknown> | null = null;
  let sourceTypeId = '';
  const contributors: string[] = [];
  for (const node of chain) {
    for (const row of rowsFor(byType.get(node.ID), key)) {
      const value = parseValue(row.Value);
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        merged = { ...(merged ?? {}), ...(value as Record<string, unknown>) };
      } else {
        merged = null; // non-object resets: treat as wholesale override
        merged = { __value: value } as Record<string, unknown>;
      }
      sourceTypeId = node.ID;
      if (!contributors.includes(node.ID)) contributors.push(node.ID);
    }
  }
  const items: ResolvedPropertyItem[] = merged
    ? [{ ItemKey: null, Value: '__value' in merged && Object.keys(merged).length === 1 ? merged['__value'] : merged, Rationale: null, SourceTypeID: sourceTypeId }]
    : [];
  return { items, contributors };
}

function toItem(row: ComponentTypePropertyRow, sourceTypeId: string): ResolvedPropertyItem {
  return { ItemKey: row.ItemKey, Value: parseValue(row.Value), Rationale: row.Rationale, SourceTypeID: sourceTypeId };
}

type PropsByType = ReadonlyMap<string, readonly ComponentTypePropertyRow[]>;
interface FoldResult {
  items: ResolvedPropertyItem[];
  contributors: string[];
}

const FOLDERS: Record<string, (c: readonly ComponentTypeNode[], p: PropsByType, k: ComponentPropertyKey) => FoldResult> = {
  union: foldUnion,
  append: foldAppend,
  override: foldOverride,
  narrow: foldOverride, // narrowing legality is the lint's job; resolution-wise, nearest wins
  mergeObject: foldMergeObject,
};

/** Fold slots: union by Name down the chain; a redeclaration replaces (the lint checks it narrows). */
function foldSlots(chain: readonly ComponentTypeNode[], slotsByType: SlotsByType): ResolvedSlot[] {
  const byName = new Map<string, ResolvedSlot>();
  for (const node of chain) {
    for (const slot of [...(slotsByType.get(node.ID) ?? [])].sort((a, b) => a.Sequence - b.Sequence)) {
      byName.set(slot.Name, {
        Name: slot.Name,
        Description: slot.Description ?? null,
        AcceptsComponentTypeID: slot.AcceptsComponentTypeID,
        MinCount: slot.MinCount,
        MaxCount: slot.MaxCount,
        DefaultComponentTypeID: slot.DefaultComponentTypeID,
        Sequence: slot.Sequence,
        SourceTypeID: node.ID,
      });
    }
  }
  return [...byName.values()].sort((a, b) => a.Sequence - b.Sequence || a.Name.localeCompare(b.Name));
}

type SlotsByType = ReadonlyMap<string, readonly ComponentTypeSlotRow[]>;

/**
 * Resolve one node's full profile: walk to the root, fold every property key per its fixed merge
 * mode, union the slots. Throws on structural impossibilities (cycle, dangling parent); leaves
 * SEMANTIC judgments (partition smells, widening) to {@link lintComponentTree}.
 */
export function resolveComponentProfile(
  leafId: string,
  nodesById: ReadonlyMap<string, ComponentTypeNode>,
  propertiesByType: PropsByType,
  slotsByType: SlotsByType,
): ResolvedComponentProfile {
  const chain = chainToRoot(leafId, nodesById);
  const properties: ResolvedComponentProfile['Properties'] = {};
  const provenance: ResolvedComponentProfile['Provenance'] = {};
  for (const key of Object.keys(PROPERTY_MERGE_MODES) as ComponentPropertyKey[]) {
    const { items, contributors } = FOLDERS[PROPERTY_MERGE_MODES[key]](chain, propertiesByType, key);
    if (items.length > 0) {
      properties[key] = items;
      provenance[key] = contributors;
    }
  }
  return {
    Leaf: chain[chain.length - 1],
    Chain: chain,
    Properties: properties,
    Slots: foldSlots(chain, slotsByType),
    Provenance: provenance,
  };
}

// ---------------------------------------------------------------------------
// Lint — the principled-partition enforcer
// ---------------------------------------------------------------------------

/** Group helper: rows/slots indexed by ComponentTypeID. */
export function groupByType<T extends { ComponentTypeID: string }>(rows: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.ComponentTypeID);
    if (list) list.push(row);
    else map.set(row.ComponentTypeID, [row]);
  }
  return map;
}

/** All descendants of `nodeId` (excluding itself), by one pass over the parent index. */
function descendantsOf(nodeId: string, childrenByParent: ReadonlyMap<string, ComponentTypeNode[]>): ComponentTypeNode[] {
  const out: ComponentTypeNode[] = [];
  const stack = [...(childrenByParent.get(nodeId) ?? [])];
  while (stack.length > 0) {
    const node = stack.pop() as ComponentTypeNode;
    out.push(node);
    stack.push(...(childrenByParent.get(node.ID) ?? []));
  }
  return out;
}

/**
 * Lint the whole tree. `Error` = structurally unusable (cycle, dangling parent, kind mismatch,
 * abstract with a driver, executable leaf without one, slot widening, narrow-set widening).
 * `Warning` = partition smell (a descendant `Remove` contradicting an ancestor `Add` — the
 * property was not true of all descendants and should move down). `Info` = hoist suggestion.
 */
export function lintComponentTree(
  nodes: readonly ComponentTypeNode[],
  properties: readonly ComponentTypePropertyRow[],
  slots: readonly ComponentTypeSlotRow[],
): TreeLintFinding[] {
  const findings: TreeLintFinding[] = [];
  const nodesById = new Map(nodes.map((n) => [n.ID, n]));
  const childrenByParent = new Map<string, ComponentTypeNode[]>();
  for (const node of nodes) {
    if (node.ParentID != null) {
      const list = childrenByParent.get(node.ParentID);
      if (list) list.push(node);
      else childrenByParent.set(node.ParentID, [node]);
    }
  }
  const propsByType = groupByType(properties);
  const slotsByType = groupByType(slots);

  lintStructure(nodes, nodesById, findings);
  lintDrivers(nodes, childrenByParent, findings);
  lintContradictions(nodes, childrenByParent, propsByType, findings);
  lintNarrowing(nodes, nodesById, propsByType, findings);
  lintSlotNarrowing(nodes, nodesById, slotsByType, childrenByParent, findings);
  return findings;
}

/** Cycles, dangling parents, kind consistency. */
function lintStructure(
  nodes: readonly ComponentTypeNode[],
  nodesById: ReadonlyMap<string, ComponentTypeNode>,
  findings: TreeLintFinding[],
): void {
  for (const node of nodes) {
    if (node.ParentID != null) {
      const parent = nodesById.get(node.ParentID);
      if (!parent) {
        findings.push({
          Severity: 'Error',
          Rule: 'dangling-parent',
          NodeID: node.ID,
          Message: `"${node.Name}" points at ParentID ${node.ParentID}, which does not exist.`,
        });
        continue;
      }
      if (parent.Kind !== node.Kind) {
        findings.push({
          Severity: 'Error',
          Rule: 'kind-consistency',
          NodeID: node.ID,
          RelatedNodeID: parent.ID,
          Message: `"${node.Name}" is Kind=${node.Kind} under "${parent.Name}" (Kind=${parent.Kind}); a child's Kind must equal its parent's.`,
        });
      }
    }
    try {
      chainToRoot(node.ID, nodesById);
    } catch (e) {
      findings.push({
        Severity: 'Error',
        Rule: 'cycle-or-depth',
        NodeID: node.ID,
        Message: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

/** Abstract/leaf driver discipline. */
function lintDrivers(
  nodes: readonly ComponentTypeNode[],
  childrenByParent: ReadonlyMap<string, ComponentTypeNode[]>,
  findings: TreeLintFinding[],
): void {
  for (const node of nodes) {
    const isLeaf = (childrenByParent.get(node.ID) ?? []).length === 0;
    if (node.IsAbstract && node.DriverClass != null) {
      findings.push({
        Severity: 'Error',
        Rule: 'abstract-with-driver',
        NodeID: node.ID,
        Message: `Abstract node "${node.Name}" carries DriverClass "${node.DriverClass}" — abstract nodes organize, they do not execute.`,
      });
    }
    if (!node.IsAbstract && isLeaf && node.DriverClass == null && DRIVER_REQUIRED_KINDS.has(node.Kind)) {
      findings.push({
        Severity: 'Error',
        Rule: 'leaf-without-driver',
        NodeID: node.ID,
        Message: `Concrete ${node.Kind} leaf "${node.Name}" has no DriverClass — nothing can execute it.`,
      });
    }
    if (node.IsAbstract && isLeaf) {
      findings.push({
        Severity: 'Warning',
        Rule: 'abstract-leaf',
        NodeID: node.ID,
        Message: `Abstract node "${node.Name}" has no children — either add members or make it concrete.`,
      });
    }
  }
}

/** A descendant `Remove` vetoing an ancestor's `Add` = the partition smell the vision names. */
function lintContradictions(
  nodes: readonly ComponentTypeNode[],
  childrenByParent: ReadonlyMap<string, ComponentTypeNode[]>,
  propsByType: ReadonlyMap<string, ComponentTypePropertyRow[]>,
  findings: TreeLintFinding[],
): void {
  for (const node of nodes) {
    const adds = (propsByType.get(node.ID) ?? []).filter((r) => r.Operation === 'Add' && r.ItemKey != null);
    if (adds.length === 0) continue;
    for (const descendant of descendantsOf(node.ID, childrenByParent)) {
      const removes = (propsByType.get(descendant.ID) ?? []).filter((r) => r.Operation === 'Remove');
      for (const add of adds) {
        if (removes.some((r) => r.PropertyKey === add.PropertyKey && r.ItemKey === add.ItemKey)) {
          findings.push({
            Severity: 'Warning',
            Rule: 'descendant-contradiction',
            NodeID: node.ID,
            RelatedNodeID: descendant.ID,
            Message:
              `"${node.Name}" adds ${add.PropertyKey}[${add.ItemKey}] but descendant "${descendant.Name}" removes it — ` +
              `the property is not true of all descendants; move it down to the siblings that keep it.`,
          });
        }
      }
    }
  }
}

/** `narrow`-mode keys: a child's set must be a subset of its nearest ancestor value. */
function lintNarrowing(
  nodes: readonly ComponentTypeNode[],
  nodesById: ReadonlyMap<string, ComponentTypeNode>,
  propsByType: ReadonlyMap<string, ComponentTypePropertyRow[]>,
  findings: TreeLintFinding[],
): void {
  const narrowKeys = (Object.keys(PROPERTY_MERGE_MODES) as ComponentPropertyKey[]).filter(
    (k) => PROPERTY_MERGE_MODES[k] === 'narrow',
  );
  for (const node of nodes) {
    for (const key of narrowKeys) {
      const own = (propsByType.get(node.ID) ?? []).filter((r) => r.PropertyKey === key);
      if (own.length === 0 || node.ParentID == null) continue;
      const inherited = nearestAncestorSet(node, nodesById, propsByType, key);
      if (inherited == null) continue;
      const ownSet = toStringSet(own[own.length - 1].Value);
      const widened = [...ownSet].filter((v) => !inherited.has(v));
      if (widened.length > 0) {
        findings.push({
          Severity: 'Error',
          Rule: 'narrow-widening',
          NodeID: node.ID,
          Message: `"${node.Name}" widens ${key} with [${widened.join(', ')}] beyond its ancestors' set — a child may only restrict.`,
        });
      }
    }
  }
}

/** The nearest ancestor's value for a narrow key, as a string set; null when no ancestor carries it. */
function nearestAncestorSet(
  node: ComponentTypeNode,
  nodesById: ReadonlyMap<string, ComponentTypeNode>,
  propsByType: ReadonlyMap<string, ComponentTypePropertyRow[]>,
  key: ComponentPropertyKey,
): Set<string> | null {
  let currentId = node.ParentID;
  while (currentId != null) {
    const ancestor = nodesById.get(currentId);
    if (!ancestor) return null;
    const rows = (propsByType.get(ancestor.ID) ?? []).filter((r) => r.PropertyKey === key);
    if (rows.length > 0) return toStringSet(rows[rows.length - 1].Value);
    currentId = ancestor.ParentID;
  }
  return null;
}

/** Coerce a stored narrow-set payload (JSON array or comma list) into a string set. */
function toStringSet(raw: string): Set<string> {
  const parsed = parseValue(raw);
  if (Array.isArray(parsed)) return new Set(parsed.map((v) => String(v)));
  return new Set(
    String(parsed)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

/** A slot redeclared below its origin must narrow `Accepts` to a descendant of the inherited node. */
function lintSlotNarrowing(
  nodes: readonly ComponentTypeNode[],
  nodesById: ReadonlyMap<string, ComponentTypeNode>,
  slotsByType: ReadonlyMap<string, ComponentTypeSlotRow[]>,
  childrenByParent: ReadonlyMap<string, ComponentTypeNode[]>,
  findings: TreeLintFinding[],
): void {
  for (const node of nodes) {
    for (const slot of slotsByType.get(node.ID) ?? []) {
      if (!nodesById.has(slot.AcceptsComponentTypeID)) {
        findings.push({
          Severity: 'Error',
          Rule: 'slot-accepts-missing',
          NodeID: node.ID,
          Message: `Slot "${slot.Name}" on "${node.Name}" accepts ${slot.AcceptsComponentTypeID}, which does not exist.`,
        });
        continue;
      }
      const inherited = nearestAncestorSlot(node, nodesById, slotsByType, slot.Name);
      if (inherited && !isDescendantOrSelf(slot.AcceptsComponentTypeID, inherited.AcceptsComponentTypeID, nodesById)) {
        findings.push({
          Severity: 'Error',
          Rule: 'slot-widening',
          NodeID: node.ID,
          Message:
            `Slot "${slot.Name}" on "${node.Name}" re-accepts a node that is not a descendant of the inherited ` +
            `acceptance — a subtype may only narrow a slot.`,
        });
      }
    }
  }
  void childrenByParent;
}

/** The nearest ancestor's declaration of `slotName`, or null. */
function nearestAncestorSlot(
  node: ComponentTypeNode,
  nodesById: ReadonlyMap<string, ComponentTypeNode>,
  slotsByType: ReadonlyMap<string, ComponentTypeSlotRow[]>,
  slotName: string,
): ComponentTypeSlotRow | null {
  let currentId = node.ParentID;
  while (currentId != null) {
    const ancestor = nodesById.get(currentId);
    if (!ancestor) return null;
    const slot = (slotsByType.get(ancestor.ID) ?? []).find((s) => s.Name === slotName);
    if (slot) return slot;
    currentId = ancestor.ParentID;
  }
  return null;
}

/** Is `nodeId` equal to, or a descendant of, `ancestorId`? */
export function isDescendantOrSelf(
  nodeId: string,
  ancestorId: string,
  nodesById: ReadonlyMap<string, ComponentTypeNode>,
): boolean {
  let currentId: string | null = nodeId;
  let hops = 0;
  while (currentId != null && hops <= MAX_TREE_DEPTH) {
    if (currentId === ancestorId) return true;
    currentId = nodesById.get(currentId)?.ParentID ?? null;
    hops++;
  }
  return false;
}
