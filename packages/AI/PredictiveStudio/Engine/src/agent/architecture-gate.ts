/**
 * @module agent/architecture-gate
 *
 * The execution gate for an LLM-authored architecture decision.
 *
 * The Architect writes `ModelingPlanSpec.Architecture` as free-form JSON. Three independent things
 * must hold before that reaches the deterministic builder, and none of them implies the others:
 *
 *  1. **Well-formed** — `validateArchitectureSpec` (Core). A `commit` naming three candidates is
 *     shaped correctly but says something incoherent.
 *  2. **Buildable** — a `compose` decision's graph must satisfy the slots the component types
 *     actually declare (`validateComponentGraph` against the live tree). Perfect JSON can still name
 *     a type that does not exist, or fill `final_estimator` with something the slot refuses.
 *  3. **Consistent with the evidence** — a candidate the statistics pre-pass found INADMISSIBLE must
 *     not be the one committed to. The gate reports already say why; silently training it anyway
 *     would make the pre-pass decorative.
 *
 * Plus one honesty constraint: `reify` and `compose` are *recordable* today but not yet
 * *executable* — the sidecar's `component_graph` execution ships later. The gate says that plainly
 * rather than quietly training the root and pretending the composition happened.
 *
 * Pure except for the optional tree lookup, and callable with no `Architecture` at all — a plan
 * written before the Architect existed passes untouched.
 */

import type {
  ArchitectureSpec,
  CandidateGateReport,
  ModelingPlanSpec,
} from '@memberjunction/predictive-studio-core';
import { validateArchitectureSpec } from '@memberjunction/predictive-studio-core';

import { validateGraphAgainstTree } from '../components/graph-resolver';
import type { MLComponentEngine } from '../components/ml-component-engine';

/** The architecture decisions the deterministic pipeline can execute TODAY. */
export const EXECUTABLE_DECISIONS = ['commit', 'defer'] as const;

/** Outcome of gating a plan's architecture. */
export interface ArchitectureGateResult {
  /** May the builder proceed? */
  Executable: boolean;
  /**
   * The validated decision when the plan carried one and it was well-formed; `null` when the plan
   * has no `Architecture` at all (which is fine — it simply predates the Architect).
   */
  Architecture: ArchitectureSpec | null;
  /** Why not, in language that can be shown to the user verbatim. Empty when `Executable`. */
  Reasons: string[];
}

/**
 * Gate a plan's architecture for execution.
 *
 * @param spec the modeling plan
 * @param engine a `Config`-ed component engine, needed only to graph-check a `compose` decision.
 *   Omit it and a `compose` decision is still refused (it is not executable yet) but its graph is
 *   not structurally checked.
 */
export function gateArchitecture(spec: ModelingPlanSpec, engine?: MLComponentEngine): ArchitectureGateResult {
  if (spec.Architecture === undefined) {
    // A plan with no architecture decision is the pre-Architect shape — the Experiment Designer's
    // ranked list is the whole plan, and it executes exactly as it always did.
    return { Executable: true, Architecture: null, Reasons: [] };
  }

  const parsed = validateArchitectureSpec(spec.Architecture);
  // `in` rather than a truthiness narrow on `ok`: this repo compiles without `strictNullChecks`, so
  // a discriminated union does not narrow on a boolean literal here.
  if ('error' in parsed) {
    return {
      Executable: false,
      Architecture: null,
      Reasons: [`The architecture decision is malformed and cannot be acted on: ${parsed.error}`],
    };
  }

  const architecture = parsed.value;
  const reasons: string[] = [
    ...checkAdmissibility(architecture, spec.GateReports ?? []),
    ...checkGraph(architecture, engine),
    ...checkExecutable(architecture),
  ];

  return { Executable: reasons.length === 0, Architecture: architecture, Reasons: reasons };
}

/**
 * Rule 3: nothing the pre-pass ruled out may be committed to. Reported per offending candidate,
 * quoting the gate report's own summary so the user reads the measured reason, not a restatement.
 */
function checkAdmissibility(architecture: ArchitectureSpec, reports: CandidateGateReport[]): string[] {
  if (reports.length === 0) {
    return [];
  }
  const inadmissible = new Map(
    reports.filter((r) => !r.Admissible).map((r) => [r.ComponentTypeName.toLowerCase(), r]),
  );
  if (inadmissible.size === 0) {
    return [];
  }

  const reasons: string[] = [];
  for (const candidate of architecture.Candidates) {
    const report = inadmissible.get(candidate.ComponentTypeRef.toLowerCase());
    if (report) {
      reasons.push(
        `'${candidate.ComponentTypeRef}' was proposed, but the measured data rules it out. ${report.Summary} ` +
          `${failedGateMessages(report)}`.trim(),
      );
    }
  }
  return reasons;
}

/** The failed gates' own messages, which carry the observed value and the threshold. */
function failedGateMessages(report: CandidateGateReport): string {
  return report.Gates.filter((g) => g.Verdict === 'Failed')
    .map((g) => g.Message)
    .join(' ');
}

/** Rule 2: a composed graph must be buildable against the real component tree. */
function checkGraph(architecture: ArchitectureSpec, engine?: MLComponentEngine): string[] {
  if (!architecture.ComposedGraph || !engine) {
    return [];
  }
  const result = validateGraphAgainstTree(architecture.ComposedGraph, engine);
  if (result.Valid) {
    return [];
  }
  return result.Findings.filter((f) => f.Severity === 'Error').map((f) => `${f.Path}: ${f.Message}`);
}

/** The honesty constraint: say what is not built yet rather than silently doing something else. */
function checkExecutable(architecture: ArchitectureSpec): string[] {
  if ((EXECUTABLE_DECISIONS as readonly string[]).includes(architecture.Decision)) {
    return [];
  }
  if (architecture.Decision === 'reify') {
    return [
      "A 'reify' architecture is recorded but cannot be trained yet — training a generalized parent as a family " +
        'of parameterizations ships with the composition runtime. Commit to one of its concrete descendants, or ' +
        'defer across them, to build now.',
    ];
  }
  return [
    "A 'compose' architecture is recorded but cannot be trained yet — executing a component graph (wrappers, " +
      'stacks, frozen reuse) ships with the sidecar composition runtime. The proposal is kept on the plan; commit ' +
      'to a single family, or defer across several, to build now.',
  ];
}
