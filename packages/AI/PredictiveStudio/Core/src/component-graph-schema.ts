/**
 * @module component-graph-schema
 *
 * Runtime (zod) validators for the **architecture decision** — the trust boundary between an LLM
 * sub-agent and the deterministic engine.
 *
 * The Architect writes {@link ArchitectureSpec} as free-form JSON. Two independent things then have
 * to be true before anything executes: it must be **well-formed** (this module), and any composed
 * graph must be **buildable against the real component tree** (`validateComponentGraph` in
 * `component-graph-spec.ts`). Neither subsumes the other — a perfectly-shaped JSON object can name
 * a type that does not exist, and a legal graph can arrive with a missing rationale.
 *
 * Structural rules encoded here that a shape check alone would miss:
 *  - `reify` must name the parent it reifies under;
 *  - `compose` must carry a graph;
 *  - a `commit` must name exactly one candidate, and a `defer` at least two — otherwise the
 *    decision label and the content disagree, and the label is what the Experiment Designer reads.
 */

import { z } from 'zod';
import type { ArchitectureSpec, ComponentGraphNode } from './component-graph-spec';

/** Depth cap mirroring the validator's, so a self-referential payload is rejected at parse time. */
const MAX_GRAPH_DEPTH = 16;

/**
 * zod schema for ONE graph node, non-recursively: `Children` is accepted as an opaque array here
 * and each element is validated by {@link walkGraphShape} below.
 *
 * Why not `z.lazy`: this repo compiles without `strictNullChecks`, under which a self-referential
 * `z.ZodType<ComponentGraphNode>` annotation collapses zod's inference and every field reads as
 * optional — which would silently accept a node with no `ComponentTypeRef`. An explicit iterative
 * walk keeps the checks real, and cannot blow the stack on a cyclic payload.
 */
export const ComponentGraphNodeSchema = z
  .object({
    ComponentTypeRef: z
      .string({ required_error: 'ComponentTypeRef is required — every node must name a component type' })
      .min(1, 'ComponentTypeRef is required — every node must name a component type'),
    SlotName: z.string().min(1).optional(),
    Params: z.record(z.unknown()).optional(),
    Children: z.array(z.unknown()).optional(),
    ReuseInstanceID: z.string().uuid('ReuseInstanceID must be a component instance id').optional(),
  })
  .strip();

/**
 * Validate a node tree iteratively (breadth-first, depth-bounded), reporting every malformed node
 * with a path a reader can follow. Reports the depth breach once and stops descending, so a cyclic
 * payload produces one clear finding rather than thousands.
 */
function walkGraphShape(root: unknown, addIssue: (path: (string | number)[], message: string) => void): void {
  const queue: Array<{ node: unknown; path: (string | number)[]; depth: number }> = [
    { node: root, path: ['ComposedGraph'], depth: 1 },
  ];
  let depthBreached = false;

  while (queue.length > 0) {
    const { node, path, depth } = queue.shift() as { node: unknown; path: (string | number)[]; depth: number };
    if (depth > MAX_GRAPH_DEPTH) {
      if (!depthBreached) {
        depthBreached = true;
        addIssue(path, `the composition is nested more than ${MAX_GRAPH_DEPTH} levels deep, which almost certainly means it refers to itself`);
      }
      continue;
    }

    const parsed = ComponentGraphNodeSchema.safeParse(node);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        addIssue([...path, ...issue.path], issue.message);
      }
      continue;
    }

    const children = parsed.data.Children ?? [];
    children.forEach((child, i) => queue.push({ node: child, path: [...path, 'Children', i], depth: depth + 1 }));
  }
}

/** One considered candidate. `Rationale` is required — an unexplained candidate is not a decision. */
export const ArchitectureCandidateSchema = z
  .object({
    ComponentTypeRef: z.string({ required_error: 'every candidate must name a component type' }).min(1, 'every candidate must name a component type'),
    Rationale: z.string({ required_error: 'every candidate needs a rationale' }).min(1, 'every candidate needs a rationale'),
    Admissible: z.boolean().optional(),
  })
  .strip();

/**
 * zod schema for {@link ArchitectureSpec}, including the cross-field rules that make the `Decision`
 * label mean what it says.
 */
export const ArchitectureSpecSchema = z
  .object({
    Decision: z.enum(['commit', 'defer', 'reify', 'compose'], {
      required_error: "Decision is required — one of 'commit', 'defer', 'reify', 'compose'",
    }),
    Rationale: z
      .string({ required_error: 'Rationale is required — the decision must be explainable' })
      .min(1, 'Rationale is required — the decision must be explainable'),
    Candidates: z
      .array(ArchitectureCandidateSchema, { required_error: 'Candidates is required — record what was considered' })
      .min(1, 'at least one candidate must be recorded'),
    ReifiedUnderComponentTypeRef: z.string().min(1).optional(),
    ComposedGraph: z.unknown().optional(),
    Reuse: z
      .array(z.object({ InstanceID: z.string().uuid(), Why: z.string().min(1) }).strip())
      .optional(),
  })
  .strip()
  .superRefine((spec, ctx) => {
    if (spec.Decision === 'reify' && !spec.ReifiedUnderComponentTypeRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ReifiedUnderComponentTypeRef'],
        message: "a 'reify' decision must name the generalized parent the candidates are variations of",
      });
    }
    if (spec.Decision === 'compose' && !spec.ComposedGraph) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ComposedGraph'],
        message: "a 'compose' decision must carry the composition it built",
      });
    }
    if (spec.Decision === 'commit' && spec.Candidates.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['Candidates'],
        message:
          `a 'commit' decision means one model family was chosen, so exactly one candidate should be recorded ` +
          `(got ${spec.Candidates.length}). Use 'defer' to race several.`,
      });
    }
    if (spec.Decision === 'defer' && spec.Candidates.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['Candidates'],
        message: "a 'defer' decision means several candidates are raced, so at least two must be recorded",
      });
    }
    if (spec.ComposedGraph !== undefined) {
      walkGraphShape(spec.ComposedGraph, (path, message) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, path, message }),
      );
    }
  });

/** Discriminated result of validating an architecture payload. */
export type ArchitectureValidationResult =
  | { ok: true; value: ArchitectureSpec }
  | { ok: false; error: string };

/**
 * Validate an untrusted value as an {@link ArchitectureSpec}. Returns a typed `value` on success or
 * a single flattened, human-readable `error` (suitable for an agent step's failure message).
 *
 * This is the SHAPE check only. A `compose` decision must additionally pass
 * `validateComponentGraph` against the live component tree before it can execute.
 */
export function validateArchitectureSpec(raw: unknown): ArchitectureValidationResult {
  const parsed = ArchitectureSpecSchema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, value: parsed.data as ArchitectureSpec };
  }
  const issues = parsed.error.issues
    .map((i) => `${i.path.length ? i.path.join('.') + ': ' : ''}${i.message}`)
    .join('; ');
  return { ok: false, error: issues };
}
