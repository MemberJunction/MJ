/**
 * @module component-graph-spec
 *
 * The **architecture decision** — what the Model Development Agent commits to before any pipeline
 * exists, and the composed component graph it may commit to.
 *
 * Today the agent's first real choice is "which of the six algorithms", made from a guidance matrix.
 * That is a decision about a *leaf*. The component tree makes a larger space available: a model can
 * be one leaf, several leaves raced against each other, a generalized parent that several concrete
 * models are variations of, or a **structure with filled slots** — a Bagging Wrapper over a Random
 * Forest, a Stacking Wrapper whose `estimators` are three different families and whose
 * `final_estimator` is a Logistic Regression, a Glass-Box Rubric whose `weights` are a hand-authored
 * matrix and whose `bands` are a Score Band output.
 *
 * So the decision itself becomes typed: {@link ArchitectureSpec} records WHICH of those four shapes
 * the agent chose, WHY, and — when it composed — the {@link ComponentGraphNode} tree it built.
 * {@link validateComponentGraph} then proves that tree is legal against the slots the component
 * types declare, *before* anything trains.
 *
 * Pure and browser-safe: the validator takes a resolver callback, so the same code runs in the
 * Studio UI (against `MLComponentEngine`'s cache) and on the server.
 */

/**
 * The four architectural shapes, in ascending order of commitment:
 *
 * - `commit` — one concrete component type. The evidence points at a single family and there is no
 *   reason to spend a search on it.
 * - `defer` — several candidates, raced on the leaderboard. The honest choice when the statistics
 *   do not separate them.
 * - `reify` — the candidates are variations of one generalized parent, so the parent is what the
 *   model IS and the variations are its parameterizations. Names the shared thing rather than
 *   picking arbitrarily among its children.
 * - `compose` — a custom model built by filling a structure's slots with other components.
 */
export type ArchitectureDecision = 'commit' | 'defer' | 'reify' | 'compose';

/**
 * A reference to a component type. A NAME (not an id) because this is what an LLM writes and a
 * human reads; the resolver turns it into an id. Names are unique on `MJ: ML Component Types`.
 */
export type ComponentTypeRef = string;

/**
 * One node of a proposed composition tree. The root has no `SlotName`; every other node names the
 * slot in its PARENT that it fills.
 */
export interface ComponentGraphNode {
  /** The component type this node instantiates, by name. */
  ComponentTypeRef: ComponentTypeRef;
  /** The parent's slot this node fills. Absent on the root — a root occupies no slot. */
  SlotName?: string;
  /** Type-specific configuration, validated against the type's `SpecSchema` at save time. */
  Params?: Record<string, unknown>;
  /** Child nodes filling this node's slots. */
  Children?: ComponentGraphNode[];
  /**
   * Reuse an EXISTING trained `MJ: ML Components` instance in this position instead of training a
   * fresh one. The referenced instance must be of a type the slot accepts; its fitted state is
   * loaded frozen.
   */
  ReuseInstanceID?: string;
}

/** One candidate the agent considered, with the evidence behind keeping or dropping it. */
export interface ArchitectureCandidate {
  ComponentTypeRef: ComponentTypeRef;
  /** Why this candidate is (or is not) a fit — in business language, citing the measured evidence. */
  Rationale: string;
  /**
   * Whether the statistics pre-pass found it admissible. Mirrors the matching
   * `CandidateGateReport.Admissible`; an inadmissible candidate must not be proposed for execution.
   */
  Admissible?: boolean;
}

/**
 * The agent's architecture decision, written by the Architect sub-agent and read by the Experiment
 * Designer. Persisted on `ModelingPlanSpec.Architecture`, so it lands on
 * `MJ: Experiment Sessions.PlanSpec` and the choice stays auditable next to the statistics that
 * informed it.
 */
export interface ArchitectureSpec {
  Decision: ArchitectureDecision;
  /** Plain-language justification, safe to show the user verbatim. */
  Rationale: string;
  /** Everything considered — including what was ruled out, and why. */
  Candidates: ArchitectureCandidate[];
  /** For `reify`: the generalized parent the candidates are variations of. */
  ReifiedUnderComponentTypeRef?: ComponentTypeRef;
  /** For `compose`: the proposed composition tree. */
  ComposedGraph?: ComponentGraphNode;
  /** Existing instances the decision reuses, for the story and for provenance. */
  Reuse?: Array<{ InstanceID: string; Why: string }>;
}

// region: validation ----------------------------------------------------------

/** The slice of a component type the graph validator needs. */
export interface GraphComponentType {
  ID: string;
  Name: string;
  Kind: string;
  IsAbstract: boolean;
}

/** The slice of a slot declaration the graph validator needs (post-inheritance resolution). */
export interface GraphSlot {
  Name: string;
  /** The type whose descendants-or-self may fill this slot. */
  AcceptsComponentTypeID: string;
  MinCount: number;
  /** `null` = unbounded. */
  MaxCount: number | null;
}

/**
 * Everything {@link validateComponentGraph} needs from the component tree, supplied as callbacks so
 * the validator stays pure and runs identically in the browser and on the server.
 */
export interface GraphResolver {
  /** Find a component type by NAME (case-insensitive), or `undefined` when there is no such type. */
  FindTypeByName(name: string): GraphComponentType | undefined;
  /** The RESOLVED slots of a type — inherited down the tree, narrowed where redeclared. */
  SlotsFor(componentTypeID: string): GraphSlot[];
  /** Is `typeID` the same as, or a descendant of, `ancestorID`? (the slot `Accepts` rule). */
  IsDescendantOf(typeID: string, ancestorID: string): boolean;
}

/** One problem with a proposed graph. `Error` makes the graph unbuildable; `Warning` is a smell. */
export interface GraphValidationFinding {
  Severity: 'Error' | 'Warning';
  /** Stable rule id (e.g. `unknown-type`, `slot-arity`, `abstract-instantiation`). */
  Rule: string;
  /** Dotted path to the offending node, e.g. `root.estimators[1]`. */
  Path: string;
  Message: string;
}

/** Result of validating a proposed composition tree. */
export interface GraphValidationResult {
  Valid: boolean;
  Findings: GraphValidationFinding[];
}

/** Guard against a cyclic or pathological graph reaching the recursion. */
const MAX_GRAPH_DEPTH = 16;

/**
 * Prove a proposed {@link ComponentGraphNode} tree is buildable, BEFORE anything trains.
 *
 * Checks, in the order a reader would ask them:
 *  1. every referenced type exists;
 *  2. no node instantiates an **abstract** type (those carry inherited properties and have nothing
 *     to run);
 *  3. every child names a slot its parent actually declares — and the ROOT names none;
 *  4. each filler's type is the slot's `Accepts` type or a descendant of it;
 *  5. slot arity: every required slot (`MinCount ≥ 1`) is filled, and no slot exceeds `MaxCount`;
 *  6. depth is bounded, so a self-referential graph reports a finding instead of blowing the stack.
 *
 * A slot left empty when `MinCount` is 0 is fine and silent — the Glass-Box Rubric's optional
 * `bands` slot is the canonical case.
 *
 * @param root the proposed tree
 * @param resolver the component-tree lookups
 */
export function validateComponentGraph(root: ComponentGraphNode, resolver: GraphResolver): GraphValidationResult {
  const findings: GraphValidationFinding[] = [];
  validateNode(root, 'root', null, resolver, findings, 0);
  return { Valid: !findings.some((f) => f.Severity === 'Error'), Findings: findings };
}

/** Validate one node and recurse into its children. `parent` is null at the root. */
function validateNode(
  node: ComponentGraphNode,
  path: string,
  parent: { type: GraphComponentType; slots: GraphSlot[] } | null,
  resolver: GraphResolver,
  findings: GraphValidationFinding[],
  depth: number,
): void {
  if (depth > MAX_GRAPH_DEPTH) {
    findings.push({
      Severity: 'Error',
      Rule: 'max-depth',
      Path: path,
      Message: `The composition is nested more than ${MAX_GRAPH_DEPTH} levels deep, which almost certainly means it refers to itself.`,
    });
    return;
  }

  const type = resolver.FindTypeByName(node.ComponentTypeRef);
  if (!type) {
    findings.push({
      Severity: 'Error',
      Rule: 'unknown-type',
      Path: path,
      Message: `There is no component type called '${node.ComponentTypeRef}'.`,
    });
    return;
  }
  if (type.IsAbstract) {
    findings.push({
      Severity: 'Error',
      Rule: 'abstract-instantiation',
      Path: path,
      Message:
        `'${type.Name}' is an abstract component type — it exists to carry inherited properties for the types ` +
        `beneath it, and has nothing to run. Use one of its concrete descendants.`,
    });
  }

  checkSlotPlacement(node, path, parent, type, resolver, findings);

  const slots = resolver.SlotsFor(type.ID);
  const children = node.Children ?? [];
  checkSlotArity(children, path, type, slots, resolver, findings);

  children.forEach((child, i) => {
    const childPath = child.SlotName ? `${path}.${child.SlotName}[${indexWithinSlot(children, child, i)}]` : `${path}.children[${i}]`;
    validateNode(child, childPath, { type, slots }, resolver, findings, depth + 1);
  });
}

/** Rule 3 + 4: the node names a real slot on its parent, and its type is accepted there. */
function checkSlotPlacement(
  node: ComponentGraphNode,
  path: string,
  parent: { type: GraphComponentType; slots: GraphSlot[] } | null,
  type: GraphComponentType,
  resolver: GraphResolver,
  findings: GraphValidationFinding[],
): void {
  if (!parent) {
    if (node.SlotName) {
      findings.push({
        Severity: 'Error',
        Rule: 'root-in-slot',
        Path: path,
        Message: `The root names slot '${node.SlotName}', but a slot is a position INSIDE a parent and the root has none.`,
      });
    }
    return;
  }

  if (!node.SlotName) {
    findings.push({
      Severity: 'Error',
      Rule: 'missing-slot-name',
      Path: path,
      Message:
        `This component sits under '${parent.type.Name}' without naming which slot it fills. ` +
        `${describeSlots(parent.type.Name, parent.slots)}`,
    });
    return;
  }

  const slot = parent.slots.find((s) => s.Name === node.SlotName);
  if (!slot) {
    findings.push({
      Severity: 'Error',
      Rule: 'unknown-slot',
      Path: path,
      Message: `'${parent.type.Name}' has no slot called '${node.SlotName}'. ${describeSlots(parent.type.Name, parent.slots)}`,
    });
    return;
  }

  if (!resolver.IsDescendantOf(type.ID, slot.AcceptsComponentTypeID)) {
    findings.push({
      Severity: 'Error',
      Rule: 'slot-accepts',
      Path: path,
      Message: `Slot '${slot.Name}' on '${parent.type.Name}' does not accept a '${type.Name}'.`,
    });
  }
}

/** Rule 5: required slots are filled, and no slot is over-filled. */
function checkSlotArity(
  children: ComponentGraphNode[],
  path: string,
  type: GraphComponentType,
  slots: GraphSlot[],
  _resolver: GraphResolver,
  findings: GraphValidationFinding[],
): void {
  const countBySlot = new Map<string, number>();
  for (const child of children) {
    if (child.SlotName) {
      countBySlot.set(child.SlotName, (countBySlot.get(child.SlotName) ?? 0) + 1);
    }
  }

  for (const slot of slots) {
    const count = countBySlot.get(slot.Name) ?? 0;
    if (count < slot.MinCount) {
      findings.push({
        Severity: 'Error',
        Rule: 'slot-arity',
        Path: `${path}.${slot.Name}`,
        Message:
          `'${type.Name}' needs at least ${slot.MinCount} component${slot.MinCount === 1 ? '' : 's'} in slot ` +
          `'${slot.Name}'${count === 0 ? ', but it is empty' : `, but only ${count} ${count === 1 ? 'is' : 'are'} filled in`}.`,
      });
    }
    if (slot.MaxCount != null && count > slot.MaxCount) {
      findings.push({
        Severity: 'Error',
        Rule: 'slot-arity',
        Path: `${path}.${slot.Name}`,
        Message: `Slot '${slot.Name}' on '${type.Name}' holds at most ${slot.MaxCount}, but ${count} were supplied.`,
      });
    }
  }
}

/** Which sibling of the same slot this is, for a readable path. */
function indexWithinSlot(children: ComponentGraphNode[], child: ComponentGraphNode, upTo: number): number {
  let n = 0;
  for (let i = 0; i < upTo; i++) {
    if (children[i].SlotName === child.SlotName) n++;
  }
  return n;
}

/** "It has slots: a, b." — so an error message says what WOULD have been valid. */
function describeSlots(typeName: string, slots: GraphSlot[]): string {
  if (slots.length === 0) {
    return `'${typeName}' declares no slots at all, so nothing can be nested inside it.`;
  }
  return `Its slots are: ${slots.map((s) => s.Name).join(', ')}.`;
}

/**
 * Flatten a graph into its nodes, depth-first, root first. Useful for counting, for collecting the
 * distinct types a proposal touches, and for the materializer.
 */
export function flattenComponentGraph(root: ComponentGraphNode): ComponentGraphNode[] {
  const out: ComponentGraphNode[] = [];
  const walk = (n: ComponentGraphNode, depth: number): void => {
    if (depth > MAX_GRAPH_DEPTH) return;
    out.push(n);
    for (const c of n.Children ?? []) walk(c, depth + 1);
  };
  walk(root, 0);
  return out;
}
