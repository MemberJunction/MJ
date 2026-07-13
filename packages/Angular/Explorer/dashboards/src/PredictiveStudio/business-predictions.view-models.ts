/**
 * Pure view-model derivations for the **business-user Predictions catalog** — the home surface that
 * reframes published ML models as plain-language "predictions" a non-technical Outcome Owner can browse,
 * trust, and act on. Each published model becomes a catalog card carrying the shared trust verdict
 * (the SAME `deriveTrustVerdict` rule the agent's publish gate uses), so a Poor / unmeasured model is
 * visibly flagged and blocked from being opened — never silently presented as usable.
 *
 * Framework-free + deterministic (like `predictive-studio.view-models.ts`) → unit-tested with no Angular.
 */

import { deriveTrustVerdict, type TrustVerdict, type TrustModelInput } from '@memberjunction/predictive-studio-core';

/** The minimal published-model slice the catalog needs (a structural superset of the engine's model row). */
export interface BusinessPredictionInput extends TrustModelInput {
  /** The `MJ: ML Models` id. */
  modelId: string;
  /** The plain-language title (the pipeline goal the agent set, or the model display name). */
  name: string;
  /** When the model was last trained/updated, for a "last run" hint. */
  updatedAt?: Date | null;
}

/** One card in the business Predictions catalog. */
export interface BusinessPredictionCard {
  modelId: string;
  /** Plain-language title shown on the card. */
  title: string;
  /** The full trust verdict (grade, plain one-liner, the canAct gate). */
  trust: TrustVerdict;
  /** Whether a business user can open/operate this prediction (= trust.canAct). */
  canOpen: boolean;
  /** When not openable, the plain reason ("Needs an analyst — not reliable yet"); else null. */
  blockedReason: string | null;
  updatedAt: Date | null;
}

/** Map a published model into a business catalog card, applying the trust gate. */
export function toBusinessPredictionCard(input: BusinessPredictionInput): BusinessPredictionCard {
  const trust = deriveTrustVerdict(input);
  return {
    modelId: input.modelId,
    title: input.name?.trim() || 'Untitled prediction',
    trust,
    canOpen: trust.canAct,
    blockedReason: trust.canAct
      ? null
      : trust.unknown
        ? 'Not measured yet — an analyst needs to validate it.'
        : 'Needs an analyst — not reliable enough to use yet.',
    updatedAt: input.updatedAt ?? null,
  };
}

const GRADE_ORDER: Record<TrustVerdict['grade'], number> = { Excellent: 0, Good: 1, Fair: 2, Poor: 3 };

/** Build the business catalog from published models, most-trustworthy first (Poor/blocked sinks to the bottom). */
export function buildBusinessCatalog(inputs: BusinessPredictionInput[]): BusinessPredictionCard[] {
  return inputs.map(toBusinessPredictionCard).sort((a, b) => GRADE_ORDER[a.trust.grade] - GRADE_ORDER[b.trust.grade]);
}
