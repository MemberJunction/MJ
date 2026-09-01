/**
 * Pure view-model derivations for the **Components** panel — the tree of component types, and the
 * resolved profile of whichever one is selected.
 *
 * The panel's whole job is to make inheritance legible: a leaf's real capabilities are the ones it
 * INHERITS, so showing its own rows would be actively misleading. Every derivation here therefore
 * carries provenance — which ancestor contributed each item — so the UI can render an "inherited
 * from" chip rather than presenting a merged list as though the leaf declared all of it.
 *
 * Pure and framework-free (no Angular, no provider), so the shaping is unit-testable with plain
 * objects. See `predictive-studio.view-models.ts` for the same pattern on the other panels.
 */

import type {
  ComponentPropertyKey,
  ComponentTypeNode,
  ResolvedComponentProfile,
  TreeLintFinding,
} from '@memberjunction/predictive-studio-core';

/** One node in the rendered tree, flattened with its depth so the template can indent it. */
export interface PSComponentTreeNode {
  id: string;
  name: string;
  kind: string;
  isAbstract: boolean;
  /** 0 for a Kind root. */
  depth: number;
  /** Whether this node has children (drives the expander). */
  hasChildren: boolean;
  /** The archetype story — what this KIND of component means, shown as the node's subtitle. */
  story: string | null;
}

/** One resolved property, with the ancestor that contributed it. */
export interface PSProfileItem {
  itemKey: string | null;
  /** The value, rendered compactly for display (objects are JSON, scalars are themselves). */
  display: string;
  rationale: string | null;
  /** The node that contributed it — `null` when it is the selected leaf's own declaration. */
  inheritedFrom: string | null;
}

/** One property key's worth of resolved items, ready to render as a section. */
export interface PSProfileSection {
  key: ComponentPropertyKey;
  /** Human-friendly heading, e.g. `PreprocessingBank` → "Preprocessing bank". */
  label: string;
  items: PSProfileItem[];
}

/** One resolved slot, with what it accepts resolved to a readable type name. */
export interface PSProfileSlot {
  name: string;
  acceptsName: string;
  /** e.g. `exactly 1`, `at least 2`, `0–1`. */
  arity: string;
  inheritedFrom: string | null;
}

/** Everything the inspector shows for the selected type. */
export interface PSComponentProfileVM {
  id: string;
  name: string;
  kind: string;
  isAbstract: boolean;
  /** Root-first, e.g. `Model → Tree Ensemble → Boosting → XGBoost`. */
  chain: string[];
  story: string | null;
  driverClass: string | null;
  sections: PSProfileSection[];
  slots: PSProfileSlot[];
}

/**
 * Flatten the component tree into a render list, depth-first, alphabetical within each level.
 *
 * @param nodes every component type
 * @param expandedIds ids whose children are shown; a collapsed node's subtree is omitted entirely
 * @param kindFilter when set, only this Kind's subtree is produced
 */
export function buildComponentTree(
  nodes: readonly ComponentTypeNode[],
  expandedIds: ReadonlySet<string>,
  kindFilter?: string,
): PSComponentTreeNode[] {
  const childrenOf = new Map<string, ComponentTypeNode[]>();
  const roots: ComponentTypeNode[] = [];
  for (const node of nodes) {
    if (kindFilter && node.Kind !== kindFilter) {
      continue;
    }
    if (node.ParentID) {
      const list = childrenOf.get(node.ParentID);
      if (list) list.push(node);
      else childrenOf.set(node.ParentID, [node]);
    } else {
      roots.push(node);
    }
  }

  const byName = (a: ComponentTypeNode, b: ComponentTypeNode) => a.Name.localeCompare(b.Name);
  const out: PSComponentTreeNode[] = [];
  const visited = new Set<string>();

  const walk = (node: ComponentTypeNode, depth: number): void => {
    // A cycle in the tree is a data bug the LINTER reports; here it must simply not hang the UI.
    if (visited.has(node.ID)) return;
    visited.add(node.ID);

    const children = (childrenOf.get(node.ID) ?? []).sort(byName);
    out.push({
      id: node.ID,
      name: node.Name,
      kind: node.Kind,
      isAbstract: node.IsAbstract,
      depth,
      hasChildren: children.length > 0,
      story: node.Story ?? null,
    });
    if (expandedIds.has(node.ID)) {
      for (const child of children) walk(child, depth + 1);
    }
  };

  for (const root of roots.sort(byName)) walk(root, 0);
  return out;
}

/** Every ancestor id of a node, so selecting a leaf can auto-expand the path to it. */
export function pathToNode(nodes: readonly ComponentTypeNode[], nodeId: string): string[] {
  const byId = new Map(nodes.map((n) => [n.ID, n]));
  const path: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(nodeId)?.ParentID ?? null;
  while (current && !seen.has(current)) {
    seen.add(current);
    path.push(current);
    current = byId.get(current)?.ParentID ?? null;
  }
  return path.reverse();
}

/** Property keys in the order a reader wants them, most decision-relevant first. */
const SECTION_ORDER: ComponentPropertyKey[] = [
  'CompatibleProblemTypes',
  'Explainability',
  'PreprocessingBank',
  'HyperparameterBank',
  'StatisticalGate',
  'ValidationDefaults',
  'MissingDataPolicy',
  'DefaultNormalization',
  'RequiredInputKinds',
  'CompatibleSlotTypes',
  'GuidanceRationale',
];

/** Headings that read as English rather than as field names. */
const SECTION_LABELS: Partial<Record<ComponentPropertyKey, string>> = {
  CompatibleProblemTypes: 'Works for',
  Explainability: 'Explainability',
  PreprocessingBank: 'Preprocessing bank',
  HyperparameterBank: 'Hyperparameter bank',
  StatisticalGate: 'Statistical gates',
  ValidationDefaults: 'Validation defaults',
  MissingDataPolicy: 'Missing-data policy',
  DefaultNormalization: 'Default normalization',
  RequiredInputKinds: 'Required inputs',
  CompatibleSlotTypes: 'Compatible slot types',
  GuidanceRationale: 'Guidance',
};

/**
 * Shape a resolved profile for the inspector, attaching an "inherited from" name to every item that
 * came from an ancestor rather than from the selected node itself.
 *
 * @param profile the resolved profile
 * @param nameById type id → display name, for the provenance chips and the slot `Accepts`
 */
export function buildProfileVM(
  profile: ResolvedComponentProfile,
  nameById: ReadonlyMap<string, string>,
): PSComponentProfileVM {
  const leafId = profile.Leaf.ID;
  const inheritedFrom = (sourceId: string): string | null =>
    sourceId === leafId ? null : nameById.get(sourceId) ?? sourceId;

  const sections: PSProfileSection[] = [];
  for (const key of SECTION_ORDER) {
    const items = profile.Properties[key];
    if (!items || items.length === 0) continue;
    sections.push({
      key,
      label: SECTION_LABELS[key] ?? key,
      items: items.map((i) => ({
        itemKey: i.ItemKey,
        display: displayValue(i.Value),
        rationale: i.Rationale,
        inheritedFrom: inheritedFrom(i.SourceTypeID),
      })),
    });
  }

  return {
    id: leafId,
    name: profile.Leaf.Name,
    kind: profile.Leaf.Kind,
    isAbstract: profile.Leaf.IsAbstract,
    chain: profile.Chain.map((c) => c.Name),
    story: profile.Leaf.Story ?? null,
    driverClass: profile.Leaf.DriverClass ?? null,
    sections,
    slots: profile.Slots.map((s) => ({
      name: s.Name,
      acceptsName: nameById.get(s.AcceptsComponentTypeID) ?? s.AcceptsComponentTypeID,
      arity: describeArity(s.MinCount, s.MaxCount),
      inheritedFrom: inheritedFrom(s.SourceTypeID),
    })),
  };
}

/** `exactly 1` / `at least 2` / `0–1` / `any number` — the arity a person can read. */
export function describeArity(min: number, max: number | null): string {
  if (max === null) {
    return min > 0 ? `at least ${min}` : 'any number';
  }
  if (min === max) {
    return `exactly ${min}`;
  }
  return `${min}–${max}`;
}

/** Render a resolved value compactly: scalars as themselves, objects/arrays as tight JSON. */
export function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Group lint findings by node so the tree can badge the nodes that have one. Findings are the
 * "principled partition" enforcer's output — a property placed on a node it is not actually true of
 * — and surfacing them in the tree is what makes that enforceable by a person, not just a test.
 */
export function lintByNode(findings: readonly TreeLintFinding[]): Map<string, TreeLintFinding[]> {
  const byNode = new Map<string, TreeLintFinding[]>();
  for (const finding of findings) {
    if (finding.Severity === 'Info') continue;
    const list = byNode.get(finding.NodeID);
    if (list) list.push(finding);
    else byNode.set(finding.NodeID, [finding]);
  }
  return byNode;
}
