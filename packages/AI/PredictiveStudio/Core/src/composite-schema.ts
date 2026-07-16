/**
 * @module composite-schema
 *
 * Runtime validation for **composite model graphs** (`MLComponent.GraphSpec`) and
 * the pure **composition-affordance helpers** (`findCompatibleSlots` /
 * `findCompatibleFillers`) — the type system that makes agent/user-designed
 * architectures legal by construction.
 *
 * Follows the `modeling-plan-schema.ts` pattern exactly: a structural zod pass
 * first, then semantic checks (acyclicity, per-edge port legality with declared
 * adapters, required-input binding, slot-fill counts, exactly one exposed output),
 * returning the same discriminated `{ ok, value } | { ok, error }` result so every
 * consumer (entity-server ValidateAsync, the composite executor, the agent's
 * legality gate) validates the SAME shape.
 *
 * Core stays entity-free: callers map `MJ: ML Component*` rows into the plain-data
 * shapes here (ComponentPort / PortAdapterDef from `port-types.ts`, ComponentShape /
 * SlotShape below).
 */

import { z } from 'zod';
import type { ComponentPort, PortAdapterDef, PortTypeName } from './port-types';
import { PortTypeNameSchema } from './port-types';

// ---------------------------------------------------------------------------
// Graph spec shapes (the GraphSpec JSON on a Composite/Template component)
// ---------------------------------------------------------------------------

/** A node in a composite graph: a reference to a registry component (by name). */
export interface CompositeNode {
  /** Unique node id within the graph (e.g. `cluster1`, `classifier`). */
  ID: string;
  /** Registry component name this node instantiates (`MJ: ML Components.Name`). */
  Component: string;
}

/** A typed edge: from one node's output port to another node's input port. */
export interface CompositeEdge {
  /** Source node ID. */
  From: string;
  /** Source output port type. */
  FromPort: PortTypeName;
  /** Target node ID. */
  To: string;
  /** Target input port type. */
  ToPort: PortTypeName;
  /** Adapter name when FromPort !== ToPort (must be a declared adapter). */
  Adapter?: string;
}

/** The composite graph specification (the `GraphSpec` JSON). */
export interface CompositeSpec {
  /** The graph's nodes (>= 1). */
  Nodes: CompositeNode[];
  /** The typed edges wiring node outputs to node inputs. */
  Edges: CompositeEdge[];
  /** The node whose output the composite exposes (exactly one terminal). */
  ExposedOutputNode: string;
}

const CompositeNodeSchema = z
  .object({ ID: z.string().min(1), Component: z.string().min(1) })
  .strip();

const CompositeEdgeSchema = z
  .object({
    From: z.string().min(1),
    FromPort: PortTypeNameSchema,
    To: z.string().min(1),
    ToPort: PortTypeNameSchema,
    Adapter: z.string().min(1).optional(),
  })
  .strip();

/** Structural zod schema for {@link CompositeSpec}. */
export const CompositeSpecSchema = z
  .object({
    Nodes: z.array(CompositeNodeSchema).min(1, 'a composite needs at least one node'),
    Edges: z.array(CompositeEdgeSchema),
    ExposedOutputNode: z.string().min(1, 'ExposedOutputNode is required'),
  })
  .strip();

// ---------------------------------------------------------------------------
// Registry shapes the validator consults (plain-data mirrors of entity rows)
// ---------------------------------------------------------------------------

/** The registry view of a component the validator needs: its name + ports (+ slots). */
export interface ComponentShape {
  /** Registry component name (`MJ: ML Components.Name`). */
  Name: string;
  /** The component's declared typed ports. */
  Ports: ComponentPort[];
  /** Template kinds only: the fillable holes. */
  Slots?: SlotShape[];
}

/** A fillable template hole — the plain-data mirror of `MJ: ML Component Slots`. */
export interface SlotShape {
  /** Slot name on the template (e.g. `model`, `cluster`). */
  Name: string;
  /** The port type a filler must EMIT to satisfy this slot. */
  RequiredPortType: PortTypeName;
  /** Minimum fillers (default 1). */
  MinCount?: number;
  /** Maximum fillers (null/undefined = unbounded). */
  MaxCount?: number | null;
}

/** Discriminated result of a composite validation attempt. */
export type CompositeValidationResult =
  | { ok: true; value: CompositeSpec }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// The validator
// ---------------------------------------------------------------------------

/**
 * Validate an untrusted GraphSpec value against the registry. Structural zod pass
 * first, then, in order: known components, unique node IDs, edge endpoints exist,
 * no self-edges, per-edge port legality (exact match or a declared adapter for
 * From→To), acyclicity (topological sort), required inputs bound, exposed output
 * exists and is terminal (no outgoing edges), and slot-fill counts for template
 * nodes. Every failure names the node/edge/slot so agents can repair.
 */
export function validateCompositeSpec(
  raw: unknown,
  components: ComponentShape[],
  adapters: PortAdapterDef[],
): CompositeValidationResult {
  const parsed = CompositeSpecSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: formatZodError(parsed.error) };
  }
  const spec = parsed.data as CompositeSpec;
  const byName = new Map(components.map((c) => [c.Name.trim().toLowerCase(), c]));
  const errors: string[] = [];

  // unique node IDs + known components
  const nodeById = new Map<string, CompositeNode>();
  for (const n of spec.Nodes) {
    if (nodeById.has(n.ID)) {
      errors.push(`duplicate node ID '${n.ID}'`);
    }
    nodeById.set(n.ID, n);
    if (!byName.has(n.Component.trim().toLowerCase())) {
      errors.push(`node '${n.ID}' references unknown component '${n.Component}'`);
    }
  }

  // edges: endpoints exist, no self-edges, port legality
  for (const e of spec.Edges) {
    const from = nodeById.get(e.From);
    const to = nodeById.get(e.To);
    if (!from) errors.push(`edge from unknown node '${e.From}'`);
    if (!to) errors.push(`edge to unknown node '${e.To}'`);
    if (e.From === e.To) {
      errors.push(`self-edge on node '${e.From}'`);
      continue;
    }
    if (from && to) {
      const fromComp = byName.get(from.Component.trim().toLowerCase());
      const toComp = byName.get(to.Component.trim().toLowerCase());
      if (fromComp && !fromComp.Ports.some((p) => p.Direction === 'Output' && p.PortType === e.FromPort)) {
        errors.push(`node '${e.From}' (${from.Component}) has no Output port of type '${e.FromPort}'`);
      }
      // an incoming edge may target an Input PORT or fill a typed SLOT (a slot IS a typed input hole)
      const toAccepts = toComp &&
        (toComp.Ports.some((p) => p.Direction === 'Input' && p.PortType === e.ToPort) ||
         (toComp.Slots ?? []).some((s) => s.RequiredPortType === e.ToPort));
      if (toComp && !toAccepts) {
        errors.push(`node '${e.To}' (${to.Component}) has no Input port or slot of type '${e.ToPort}'`);
      }
      if (e.FromPort !== e.ToPort) {
        const adapter = adapters.find(
          (a) => a.FromPortType === e.FromPort && a.ToPortType === e.ToPort &&
                 (!e.Adapter || a.Name === e.Adapter),
        );
        if (!adapter) {
          errors.push(
            `edge '${e.From}'→'${e.To}': port mismatch '${e.FromPort}'→'${e.ToPort}' ` +
            `with no declared adapter${e.Adapter ? ` named '${e.Adapter}'` : ''}`,
          );
        }
      } else if (e.Adapter) {
        const adapter = adapters.find((a) => a.Name === e.Adapter);
        if (!adapter) errors.push(`edge '${e.From}'→'${e.To}' names unknown adapter '${e.Adapter}'`);
      }
    }
  }

  // acyclicity via Kahn's topological sort
  const indegree = new Map<string, number>(spec.Nodes.map((n) => [n.ID, 0]));
  const adj = new Map<string, string[]>(spec.Nodes.map((n) => [n.ID, []]));
  for (const e of spec.Edges) {
    if (e.From !== e.To && indegree.has(e.From) && indegree.has(e.To)) {
      indegree.set(e.To, (indegree.get(e.To) ?? 0) + 1);
      adj.get(e.From)?.push(e.To);
    }
  }
  const queue = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift() as string;
    visited++;
    for (const nxt of adj.get(id) ?? []) {
      const d = (indegree.get(nxt) ?? 0) - 1;
      indegree.set(nxt, d);
      if (d === 0) queue.push(nxt);
    }
  }
  if (visited !== spec.Nodes.length) {
    errors.push('the graph contains a cycle');
  }

  // required inputs bound (every required Input port of every node has an incoming edge)
  for (const n of spec.Nodes) {
    const comp = byName.get(n.Component.trim().toLowerCase());
    if (!comp) continue;
    for (const p of comp.Ports) {
      if (p.Direction !== 'Input' || p.IsRequired === false) continue;
      // features:tabular root inputs are fed by the pipeline's assembled matrix, not an edge
      if (p.PortType === 'features:tabular' || p.PortType === 'features:sequence' ||
          p.PortType === 'series' || p.PortType === 'event-log' || p.PortType === 'interaction-matrix') {
        continue;
      }
      const bound = spec.Edges.some((e) => e.To === n.ID && e.ToPort === p.PortType);
      if (!bound) {
        errors.push(`node '${n.ID}' (${n.Component}): required input port '${p.Name}' (${p.PortType}) is unbound`);
      }
    }
  }

  // exposed output: exists + terminal (no outgoing edges)
  if (!nodeById.has(spec.ExposedOutputNode)) {
    errors.push(`ExposedOutputNode '${spec.ExposedOutputNode}' is not a node in the graph`);
  } else if (spec.Edges.some((e) => e.From === spec.ExposedOutputNode)) {
    errors.push(`ExposedOutputNode '${spec.ExposedOutputNode}' has outgoing edges — the exposed output must be terminal`);
  }
  // exactly one terminal output overall: no OTHER sink may also be edge-less w/ outputs?
  // (deliberately NOT enforced: intermediate sinks like explainers are allowed; the
  //  single-exposed-output rule is what the executor scores.)

  // slot-fill counts for template nodes: fillers = incoming edges grouped per slot port type
  for (const n of spec.Nodes) {
    const comp = byName.get(n.Component.trim().toLowerCase());
    if (!comp?.Slots?.length) continue;
    for (const slot of comp.Slots) {
      const fills = spec.Edges.filter((e) => e.To === n.ID && e.ToPort === slot.RequiredPortType).length;
      const min = slot.MinCount ?? 1;
      const max = slot.MaxCount ?? null;
      if (fills < min) {
        errors.push(`template node '${n.ID}' (${comp.Name}): slot '${slot.Name}' underfilled (${fills} < min ${min})`);
      }
      if (max != null && fills > max) {
        errors.push(`template node '${n.ID}' (${comp.Name}): slot '${slot.Name}' overfilled (${fills} > max ${max})`);
      }
    }
  }

  if (errors.length) {
    return { ok: false, error: errors.join('; ') };
  }
  return { ok: true, value: spec };
}

// ---------------------------------------------------------------------------
// Affordance helpers — "there is and can be", computed never stored
// ---------------------------------------------------------------------------

/** A (template, slot) pair a component can fill. */
export interface SlotAffordance {
  /** The template component's name. */
  TemplateName: string;
  /** The slot on that template. */
  SlotName: string;
  /** The port type the slot requires (and the component emits). */
  PortType: PortTypeName;
  /** True when the fit is via a declared adapter rather than an exact match. */
  ViaAdapter?: string;
}

/**
 * Compute which template slots `component` can fill — its membership affordances.
 * A component fits a slot when it EMITS the slot's required port type exactly, or
 * a declared adapter coerces one of its outputs into it.
 */
export function findCompatibleSlots(
  component: ComponentShape,
  templates: ComponentShape[],
  adapters: PortAdapterDef[] = [],
): SlotAffordance[] {
  const emits = new Set<PortTypeName>(
    component.Ports.filter((p) => p.Direction === 'Output').map((p) => p.PortType),
  );
  const out: SlotAffordance[] = [];
  for (const t of templates) {
    for (const slot of t.Slots ?? []) {
      if (emits.has(slot.RequiredPortType)) {
        out.push({ TemplateName: t.Name, SlotName: slot.Name, PortType: slot.RequiredPortType });
        continue;
      }
      const bridge = adapters.find(
        (a) => emits.has(a.FromPortType) && a.ToPortType === slot.RequiredPortType,
      );
      if (bridge) {
        out.push({
          TemplateName: t.Name, SlotName: slot.Name,
          PortType: slot.RequiredPortType, ViaAdapter: bridge.Name,
        });
      }
    }
  }
  return out;
}

/**
 * Compute which components can fill `slot` on a template — the inverse affordance.
 */
export function findCompatibleFillers(
  slot: SlotShape,
  components: ComponentShape[],
  adapters: PortAdapterDef[] = [],
): ComponentShape[] {
  return components.filter((c) => {
    const emits = c.Ports.filter((p) => p.Direction === 'Output').map((p) => p.PortType);
    if (emits.includes(slot.RequiredPortType)) return true;
    return adapters.some(
      (a) => emits.includes(a.FromPortType) && a.ToPortType === slot.RequiredPortType,
    );
  });
}

/** Flatten a ZodError into a single `path: message; …` string. */
function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}
