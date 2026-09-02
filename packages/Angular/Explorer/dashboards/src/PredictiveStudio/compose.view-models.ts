/**
 * @module PredictiveStudio/compose.view-models
 *
 * Pure view-models for the **Compose** panel — building a model out of components by filling a
 * structure's slots, and seeing immediately whether what you built is legal.
 *
 * Everything here is a pure function over plain data. The panel does rendering and clicks; the
 * rules live in `validateComponentGraph` (Core), which this module simply projects into a shape a
 * template can loop over. That split is what lets the same rules run in the browser, on the server,
 * and in the Architect sub-agent without a second implementation drifting away from the first.
 *
 * **Paths are the contract.** `validateComponentGraph` reports findings against dotted paths
 * (`root.estimators[1]`), so the view-model rebuilds those paths with the identical rule and hangs
 * each finding on the node it belongs to. A mismatch would silently orphan every error — the panel
 * would look clean while the graph was unbuildable — so the format is derived here once, exported,
 * and pinned by a test that diffs it against the validator's own output.
 *
 * **Mutation is by index trail, never by parsing a path string.** A path is for display and finding
 * lookup; edits navigate the real child arrays. Parsing `root.estimators[1]` back into a position
 * would re-derive the structure a second way, and the two would eventually disagree.
 */

import type {
  ComponentGraphNode,
  GraphComponentType,
  GraphResolver,
  GraphSlot,
  GraphValidationFinding,
} from '@memberjunction/predictive-studio-core';

/** A slot on a node in the composition, with whatever is currently filling it. */
export interface PSComposeSlotVM {
  /** Slot name as declared on the type (`base_estimator`, `estimators`, …). */
  Name: string;
  /** Display name of the type this slot accepts (descendants-or-self). */
  AcceptsName: string;
  AcceptsTypeID: string;
  /** Human phrasing of the arity, e.g. "exactly 1", "2 or more", "up to 3". */
  Arity: string;
  MinCount: number;
  MaxCount: number | null;
  /** Nodes currently filling this slot, in order. */
  Children: PSComposeNodeVM[];
  /** Whether another child may be added (unbounded, or under `MaxCount`). */
  CanAddMore: boolean;
  /** Whether the slot has fewer children than `MinCount` — the graph is not yet buildable. */
  IsUnderfilled: boolean;
}

/** One node of the composition, projected for rendering. */
export interface PSComposeNodeVM {
  /** Dotted path, identical to the one `validateComponentGraph` reports findings against. */
  Path: string;
  /** Index trail from the root through `Children` arrays — how an edit locates this node. */
  Trail: number[];
  /** The type name exactly as written on the graph. */
  TypeRef: string;
  /** Resolved type, when the tree knows it. */
  Type: GraphComponentType | null;
  /** The parent slot this node fills; `null` at the root. */
  SlotName: string | null;
  /** Slots this node exposes, each with its current children. */
  Slots: PSComposeSlotVM[];
  /** Findings whose `Path` is exactly this node's. */
  Findings: GraphValidationFinding[];
  /** True when any finding at or below this node is an Error — drives the collapsed-branch marker. */
  HasErrorBelow: boolean;
  /** Nesting depth, for indentation. */
  Depth: number;
}

/** A component type offered as a candidate to fill a particular slot. */
export interface PSComposeCandidate {
  ID: string;
  Name: string;
  Kind: string;
  /** Concrete types can be instantiated; an abstract one is shown disabled, with the reason. */
  IsAbstract: boolean;
  /** Why it cannot be chosen, or `null` when it can. */
  DisabledReason: string | null;
}

/**
 * Rebuild the path `validateComponentGraph` uses for a child node.
 *
 * Exported so the rule exists in exactly one place: the validator derives finding paths this way,
 * and the view-model must derive display paths the same way or findings land nowhere.
 */
export function composeChildPath(parentPath: string, siblings: readonly ComponentGraphNode[], index: number): string {
  const child = siblings[index];
  if (!child.SlotName) {
    return `${parentPath}.children[${index}]`;
  }
  let withinSlot = 0;
  for (let i = 0; i < index; i++) {
    if (siblings[i].SlotName === child.SlotName) withinSlot++;
  }
  return `${parentPath}.${child.SlotName}[${withinSlot}]`;
}

/**
 * Project a composition graph into the tree the Compose panel renders.
 *
 * @param root the graph being composed
 * @param resolver the live component tree (types, resolved slots, descendant checks)
 * @param findings output of `validateComponentGraph` over the same graph
 * @param allTypes every known type, used only to name what a slot accepts. Passed in rather than
 *   added to `GraphResolver`, so the Core validator contract stays exactly as narrow as it needs.
 */
export function buildComposeVM(
  root: ComponentGraphNode,
  resolver: GraphResolver,
  findings: readonly GraphValidationFinding[],
  allTypes: readonly GraphComponentType[] = [],
): PSComposeNodeVM {
  const byPath = new Map<string, GraphValidationFinding[]>();
  for (const f of findings) {
    const list = byPath.get(f.Path);
    if (list) list.push(f);
    else byPath.set(f.Path, [f]);
  }
  const namesByID = new Map(allTypes.map((t) => [t.ID, t.Name]));
  return buildNode(root, 'root', [], null, resolver, byPath, namesByID, 0);
}

/** Build one node and, recursively, whatever fills its slots. */
function buildNode(
  node: ComponentGraphNode,
  path: string,
  trail: number[],
  slotName: string | null,
  resolver: GraphResolver,
  byPath: Map<string, GraphValidationFinding[]>,
  namesByID: Map<string, string>,
  depth: number,
): PSComposeNodeVM {
  const type = resolver.FindTypeByName(node.ComponentTypeRef) ?? null;
  const children = node.Children ?? [];

  // Children are grouped under the slot they fill, so the panel can render an empty slot as a
  // labelled drop target rather than leaving it invisible.
  const slots: PSComposeSlotVM[] = (type ? resolver.SlotsFor(type.ID) : []).map((slot) => {
    const filling: PSComposeNodeVM[] = [];
    children.forEach((child, i) => {
      if (child.SlotName !== slot.Name) return;
      filling.push(
        buildNode(child, composeChildPath(path, children, i), [...trail, i], slot.Name, resolver, byPath, namesByID, depth + 1),
      );
    });
    return {
      Name: slot.Name,
      AcceptsName: namesByID.get(slot.AcceptsComponentTypeID) ?? slot.AcceptsComponentTypeID ?? '—',
      AcceptsTypeID: slot.AcceptsComponentTypeID,
      Arity: describeSlotArity(slot),
      MinCount: slot.MinCount,
      MaxCount: slot.MaxCount,
      Children: filling,
      CanAddMore: slot.MaxCount == null || filling.length < slot.MaxCount,
      IsUnderfilled: filling.length < slot.MinCount,
    };
  });

  // A child naming a slot the type does not declare would otherwise vanish from the panel — the
  // validator flags it, so it must still be visible to be fixed.
  const declared = new Set(slots.map((s) => s.Name));
  const orphans: PSComposeNodeVM[] = [];
  children.forEach((child, i) => {
    if (child.SlotName && declared.has(child.SlotName)) return;
    orphans.push(
      buildNode(child, composeChildPath(path, children, i), [...trail, i], child.SlotName ?? null, resolver, byPath, namesByID, depth + 1),
    );
  });
  if (orphans.length > 0) {
    slots.push({
      Name: '(unrecognized)',
      AcceptsName: '—',
      AcceptsTypeID: '',
      Arity: 'not a slot on this type',
      MinCount: 0,
      MaxCount: null,
      Children: orphans,
      CanAddMore: false,
      IsUnderfilled: false,
    });
  }

  const own = byPath.get(path) ?? [];
  const hasErrorBelow =
    own.some((f) => f.Severity === 'Error') || slots.some((s) => s.Children.some((c) => c.HasErrorBelow));

  return {
    Path: path,
    Trail: trail,
    TypeRef: node.ComponentTypeRef,
    Type: type,
    SlotName: slotName,
    Slots: slots,
    Findings: own,
    HasErrorBelow: hasErrorBelow,
    Depth: depth,
  };
}

/** "exactly 1" / "2 or more" / "up to 3" / "1–3" — the arity in words. */
export function describeSlotArity(slot: Pick<GraphSlot, 'MinCount' | 'MaxCount'>): string {
  const { MinCount: min, MaxCount: max } = slot;
  if (max == null) return min === 0 ? 'any number' : `${min} or more`;
  if (min === max) return `exactly ${min}`;
  if (min === 0) return `up to ${max}`;
  return `${min}–${max}`;
}

/**
 * The component types that may fill a slot — those the slot accepts, by the same descendant-or-self
 * rule the validator enforces.
 *
 * An abstract type is RETURNED but disabled rather than hidden: it names a real place in the tree,
 * and telling someone why they cannot pick `Boosting` teaches the model better than silently
 * omitting it.
 */
export function candidateTypesForSlot(
  slot: Pick<PSComposeSlotVM, 'AcceptsTypeID' | 'CanAddMore'>,
  allTypes: readonly GraphComponentType[],
  resolver: GraphResolver,
): PSComposeCandidate[] {
  if (!slot.AcceptsTypeID) return [];
  return allTypes
    .filter((t) => resolver.IsDescendantOf(t.ID, slot.AcceptsTypeID))
    .map((t) => ({
      ID: t.ID,
      Name: t.Name,
      Kind: t.Kind,
      IsAbstract: t.IsAbstract,
      DisabledReason: t.IsAbstract
        ? `${t.Name} is abstract — it names a place in the tree, not something that can be trained. Pick one of its descendants.`
        : !slot.CanAddMore
          ? 'This slot is already full.'
          : null,
    }))
    .sort((a, b) => Number(a.IsAbstract) - Number(b.IsAbstract) || a.Name.localeCompare(b.Name));
}

// ---------------------------------------------------------------------------
// Immutable edits — every one returns a NEW graph, so change detection sees it
// ---------------------------------------------------------------------------

/** Add a child of `typeRef` into `slotName` on the node at `trail`. */
export function fillSlot(
  root: ComponentGraphNode,
  trail: readonly number[],
  slotName: string,
  typeRef: string,
): ComponentGraphNode {
  return mapNodeAt(root, trail, (node) => ({
    ...node,
    Children: [...(node.Children ?? []), { ComponentTypeRef: typeRef, SlotName: slotName }],
  }));
}

/** Remove the node at `trail`. Returns the graph unchanged when `trail` is the root. */
export function removeNodeAt(root: ComponentGraphNode, trail: readonly number[]): ComponentGraphNode {
  if (trail.length === 0) return root;
  const parentTrail = trail.slice(0, -1);
  const index = trail[trail.length - 1];
  return mapNodeAt(root, parentTrail, (node) => ({
    ...node,
    Children: (node.Children ?? []).filter((_c, i) => i !== index),
  }));
}

/** Replace the params of the node at `trail`. */
export function setParamsAt(
  root: ComponentGraphNode,
  trail: readonly number[],
  params: Record<string, unknown>,
): ComponentGraphNode {
  return mapNodeAt(root, trail, (node) => ({ ...node, Params: params }));
}

/** Replace the whole root type, discarding children (they belonged to the old type's slots). */
export function setRootType(root: ComponentGraphNode, typeRef: string): ComponentGraphNode {
  return root.ComponentTypeRef === typeRef ? root : { ComponentTypeRef: typeRef };
}

/** Apply `fn` to the node at `trail`, rebuilding only the spine above it. */
function mapNodeAt(
  node: ComponentGraphNode,
  trail: readonly number[],
  fn: (n: ComponentGraphNode) => ComponentGraphNode,
): ComponentGraphNode {
  if (trail.length === 0) return fn(node);
  const [head, ...rest] = trail;
  const children = node.Children ?? [];
  if (head < 0 || head >= children.length) return node; // stale trail — leave the graph untouched
  const next = [...children];
  next[head] = mapNodeAt(children[head], rest, fn);
  return { ...node, Children: next };
}

/** Flatten the VM tree depth-first, for rendering as a flat list of indented rows. */
export function flattenComposeVM(root: PSComposeNodeVM): PSComposeNodeVM[] {
  const out: PSComposeNodeVM[] = [];
  const walk = (n: PSComposeNodeVM): void => {
    out.push(n);
    for (const slot of n.Slots) for (const child of slot.Children) walk(child);
  };
  walk(root);
  return out;
}
