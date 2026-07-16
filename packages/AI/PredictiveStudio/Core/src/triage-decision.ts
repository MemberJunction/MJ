/**
 * @module triage-decision
 *
 * The Architecture Strategist's typed verdict (Doc 5 §1) + its runtime validator —
 * the production form of the phase-0 `rd_reason.validate_triage` twin. A
 * {@link TriageDecision} is what the agent emits after reading the Statistician's
 * qualia report and the reusable-component library: WHICH task family, WHETHER a
 * model is worth building, and the commit / defer / combine / reuse verdict, each
 * citing computed statistics.
 *
 * The validator enforces LEGALITY that no prompt can be trusted to self-police
 * (LLM proposes, code enforces), including the DETERMINISTIC IDENTIFICATION GATE:
 * a causal / uplift question with no treatment column admits ONLY `defer` — reusing
 * a risk model as an uplift answer is the risk-vs-uplift conflation, rejected
 * regardless of how plausible the rationale sounds. Kept in Core so every consumer
 * (agent orchestrator, evals, UI) validates the SAME shape.
 */

import { z } from 'zod';
import { ALL_TASKS } from './tasks';

/**
 * Triage-level question families. A SUPERSET of the 10 modeling {@link Task}s
 * (derived from `ALL_TASKS`, so it tracks CodeGen/union growth) plus two
 * triage-only outcomes that map to no single buildable model:
 *   - `uplift` — a causal "who would contact CHANGE" question (needs a treatment column)
 *   - `none`   — no model is warranted (e.g. pure noise; the honest no-model outcome)
 */
export const TRIAGE_TASK_FAMILIES = [...ALL_TASKS, 'uplift', 'none'] as const;

/** A member of {@link TRIAGE_TASK_FAMILIES}. */
export type TriageTaskFamily = (typeof TRIAGE_TASK_FAMILIES)[number];

/** The four triage verdicts (plan §1 / Doc 5). */
export const TRIAGE_VERDICTS = ['commit', 'defer', 'combine', 'reuse'] as const;
export type TriageVerdict = (typeof TRIAGE_VERDICTS)[number];

/**
 * A single cited statistic backing the verdict — the anti-post-hoc-rationalization
 * substrate. `name` MUST resolve to a stat the Statistician actually computed (the
 * validator string-checks it against the qualia keys).
 */
export interface CitedStatistic {
  /** Stat name, e.g. `class_balance`, `censored_fraction`, `vif_max`. */
  name: string;
  /** The computed value the agent read. */
  value: number;
  /** One sentence tying the stat to the verdict. */
  why: string;
}

/** A node in a `combine` verdict's composition graph. */
export interface TriageGraphNode {
  id: string;
  /** A catalog component name (validated ⊆ the known catalog). */
  component: string;
}

/** Edge between two composition nodes, carrying the port it wires. */
export interface TriageGraphEdge {
  from: string;
  to: string;
  port: string;
  adapter?: string;
}

/**
 * WHY a model is worth building and what it would theoretically be worth — the
 * user-emphasized judgment layer (a renewal classifier at a 94% base rate is nearly
 * vacuous; an at-risk RANKER judged by PR-AUC/lift is meaningful).
 */
export interface ExpectedMeaningfulness {
  /** The decision this model would inform (who gets a retention call, when to intervene). */
  decisionInformed: string;
  /** The value metric that actually matters given the data (PR-AUC/lift, C-index, MASE…). */
  valueMetric: string;
  /** The honest theoretical ceiling read from qualia (top univariate AUC, quick-CV band). */
  honestCeiling: string;
}

/** The Architecture Strategist's full typed verdict. */
export interface TriageDecision {
  taskFamily: TriageTaskFamily;
  triage: TriageVerdict;
  modelWorthBuilding: boolean;
  expectedMeaningfulness: ExpectedMeaningfulness;
  chosenComponents: string[];
  compositionGraph?: { nodes: TriageGraphNode[]; edges: TriageGraphEdge[] };
  calibrationRequired: boolean;
  citedStats: CitedStatistic[];
  /** For `defer`: the missing data / prerequisites that block a commit. */
  dataPrerequisites: string[];
  storySeed: { nominalName: string; narrative: string };
  rationale: string;
}

/**
 * Context the validator needs to check a decision against reality — supplied by the
 * orchestrator from the qualia report + catalog + session library, never from the LLM.
 */
export interface TriageValidationContext {
  /** The situation's task family (used by the identification gate). */
  situationFamily?: TriageTaskFamily;
  /** Whether a treatment / exposure column exists (identification gate). `false` ⇒ uplift unidentifiable. */
  treatmentColumnPresent?: boolean;
  /** Known catalog component names (lowercased-compared) — `combine` nodes must be a subset. */
  catalogComponentNames: string[];
  /** Reusable-library candidate names (nominal + technical) — `reuse` must name one. */
  libraryCandidateNames: string[];
  /** Qualia stat keys the Statistician computed — `citedStats` must resolve to these. */
  qualiaKeys: string[];
}

const CitedStatisticSchema = z
  .object({ name: z.string().min(1), value: z.number(), why: z.string().min(1) })
  .strip();

const TriageGraphNodeSchema = z.object({ id: z.string().min(1), component: z.string().min(1) }).strip();
const TriageGraphEdgeSchema = z
  .object({ from: z.string().min(1), to: z.string().min(1), port: z.string().min(1), adapter: z.string().optional() })
  .strip();

/** zod schema for {@link TriageDecision} — the structural pass before semantic legality. */
export const TriageDecisionSchema = z
  .object({
    taskFamily: z.enum(TRIAGE_TASK_FAMILIES),
    triage: z.enum(TRIAGE_VERDICTS),
    modelWorthBuilding: z.boolean(),
    expectedMeaningfulness: z
      .object({
        decisionInformed: z.string().min(1),
        valueMetric: z.string().min(1),
        honestCeiling: z.string().min(1),
      })
      .strip(),
    chosenComponents: z.array(z.string()),
    compositionGraph: z
      .object({ nodes: z.array(TriageGraphNodeSchema), edges: z.array(TriageGraphEdgeSchema) })
      .strip()
      .optional(),
    calibrationRequired: z.boolean(),
    citedStats: z.array(CitedStatisticSchema),
    dataPrerequisites: z.array(z.string()),
    storySeed: z.object({ nominalName: z.string().min(1), narrative: z.string().min(1) }).strip(),
    rationale: z.string().min(1),
  })
  .strip();

/** The discriminated result of {@link validateTriageDecision}. */
export type TriageValidationResult =
  | { ok: true; value: TriageDecision; citationsValid: number }
  | { ok: false; error: string; problems: string[]; citationsValid: number };

const includesEither = (a: string, b: string): boolean => a.includes(b) || b.includes(a);

/**
 * Validate a triage decision structurally (zod) then semantically (legality). The
 * semantic rules mirror `rd_reason.validate_triage` exactly:
 *   1. IDENTIFICATION GATE — uplift family + no treatment column ⇒ ONLY `defer`.
 *   2. `combine` ⇒ a ≥2-node composition graph whose components are ⊆ the catalog.
 *   3. `reuse`   ⇒ at least one chosen component names a session-library candidate.
 *   4. `defer`   ⇒ names prerequisites OR carries ≥2 branch candidates.
 *   5. every cited stat resolves to a computed qualia key.
 *
 * `citationsValid` (0..1) is the fraction of cited stats that resolve — surfaced even
 * on success so callers can track citation quality without failing the decision.
 */
export function validateTriageDecision(
  raw: unknown,
  context: TriageValidationContext,
): TriageValidationResult {
  const parsed = TriageDecisionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: formatZodError(parsed.error), problems: [], citationsValid: 0 };
  }
  const d = parsed.data as unknown as TriageDecision;
  const problems: string[] = [];

  // 1. Identification gate — the deterministic risk-vs-uplift guard.
  const family = context.situationFamily ?? d.taskFamily;
  if (family === 'uplift' && context.treatmentColumnPresent === false && d.triage !== 'defer') {
    problems.push(
      'IDENTIFICATION GATE: the question asks who contact would CHANGE (uplift), but no ' +
        'treatment/contact-history column exists — uplift is unidentifiable; a risk model ranks ' +
        'who might lapse, NOT who contact would move. Only defer (naming the missing data) is legal.',
    );
  }

  // 2. combine — needs a real ≥2-node graph of known components.
  if (d.triage === 'combine') {
    const nodes = d.compositionGraph?.nodes ?? [];
    if (nodes.length < 2) problems.push('combine without a >=2-node composition graph');
    const known = new Set(context.catalogComponentNames.map((n) => n.toLowerCase()));
    const unknown = nodes.map((n) => n.component).filter((c) => !known.has(c.toLowerCase()));
    if (unknown.length > 0) problems.push(`combine references unknown components: ${unknown.join(', ')}`);
  }

  // 3. reuse — must actually name a library candidate.
  if (d.triage === 'reuse') {
    const names = context.libraryCandidateNames.map((n) => n.toLowerCase());
    const chosen = d.chosenComponents.map((c) => c.toLowerCase());
    if (!chosen.some((c) => names.some((n) => includesEither(c, n)))) {
      problems.push('reuse without naming a session-library candidate');
    }
  }

  // 4. defer — needs prerequisites or ≥2 branch candidates.
  if (d.triage === 'defer') {
    if (d.dataPrerequisites.length === 0 && d.chosenComponents.length < 2) {
      problems.push('defer without prerequisites or >=2 branch candidates');
    }
  }

  // 5. cited stats must resolve to computed qualia keys.
  const qkeys = context.qualiaKeys.map((k) => k.toLowerCase());
  const badCites = d.citedStats
    .map((c) => c.name.toLowerCase())
    .filter((name) => {
      const leaf = name.split('.').pop() ?? name;
      return !qkeys.includes(leaf) && !qkeys.some((k) => includesEither(name, k));
    });
  if (badCites.length > 0) problems.push(`cited stats not present in qualia report: ${badCites.join(', ')}`);

  const citationsValid = 1 - badCites.length / Math.max(d.citedStats.length, 1);

  if (problems.length > 0) {
    return { ok: false, error: problems.join('; '), problems, citationsValid };
  }
  return { ok: true, value: d, citationsValid };
}

/** Flatten a zod error into a single readable string (local copy — no cross-file coupling). */
function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}
