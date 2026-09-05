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
 * All four decisions are now executable: `compose` with the sidecar's `component_graph` runtime,
 * and `reify` once the component-combination search became the production wave strategist — a
 * generalized parent is trained as a family of parameterizations by searching its knobs, which is
 * exactly what that strategist does.
 *
 * `reify` earns one rule of its own. Its whole claim is that the candidates ARE variations of one
 * parent; if they are not, the decision is a mislabel, and every model trained under it would be
 * filed against a family it does not belong to. So the claim is CHECKED against the real tree
 * rather than taken on the Architect's word.
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

/**
 * The architecture decisions the deterministic pipeline can execute TODAY.
 *
 * `compose` joined the list with the sidecar composition runtime: a validated graph is translated
 * to drivers, reused components load frozen, and one `MJ: ML Components` row is written per node.
 */
export const EXECUTABLE_DECISIONS = ['commit', 'defer', 'reify', 'compose'] as const;

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
    if (spec.ArchitectureAttempted) {
      // The Architect RAN and wrote nothing. Treating that as the pre-Architect shape would build a
      // model with no architecture decision behind it while the plan looks entirely normal — the
      // failure is invisible precisely because the absent field looks like the legacy case.
      return {
        Executable: false,
        Architecture: null,
        Reasons: [
          'The Architect ran but produced no architecture decision, so there is nothing to execute. ' +
            'Re-run it; building now would train a model no decision selected.',
        ],
      };
    }
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
    ...checkReified(architecture, engine),
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

/**
 * Rule 4: a `reify` decision's candidates must really be descendants of the parent it names.
 *
 * "These are all Boosting variants" is the entire content of a reify — it is what distinguishes it
 * from a `defer` across an arbitrary set. Left unchecked, an Architect could file XGBoost and a
 * Logistic Regression under `Boosting` and every model trained in that session would be recorded as
 * belonging to a family it is not in. The tree already knows the answer, so ask it.
 *
 * Needs the engine to check; without one the claim is left alone rather than assumed true, and the
 * decision still executes — the same posture `checkGraph` takes.
 */
function checkReified(architecture: ArchitectureSpec, engine?: MLComponentEngine): string[] {
  if (architecture.Decision !== 'reify' || !architecture.ReifiedUnderComponentTypeRef || !engine) {
    return [];
  }
  const parentRef = architecture.ReifiedUnderComponentTypeRef;
  const parent = engine.FindTypeByName(parentRef);
  if (!parent) {
    return [`The architecture reifies under '${parentRef}', which is not a component type in the tree.`];
  }

  const reasons: string[] = [];
  for (const candidate of architecture.Candidates) {
    const type = engine.FindTypeByName(candidate.ComponentTypeRef);
    if (!type) {
      reasons.push(`'${candidate.ComponentTypeRef}' was proposed but is not a component type in the tree.`);
      continue;
    }
    if (!engine.IsDescendantOf(type.ID, parent.ID)) {
      reasons.push(
        `'${candidate.ComponentTypeRef}' is not a '${parent.Name}', so the candidates are not variations of one ` +
          `parent. Reify under their real common ancestor, or defer across them instead.`,
      );
    }
  }
  return reasons;
}

/** The honesty constraint: say what is not built yet rather than silently doing something else. */
function checkExecutable(architecture: ArchitectureSpec): string[] {
  if ((EXECUTABLE_DECISIONS as readonly string[]).includes(architecture.Decision)) {
    return [];
  }
  // Every decision in the union is executable today; this remains as the guard for whatever is
  // added to `ArchitectureDecision` next, so a new kind cannot silently execute as something else.
  return [
    `A '${architecture.Decision}' architecture is recorded but there is no path that can train it yet. ` +
      `Commit to a concrete component type, or defer across several, to build now.`,
  ];
}
