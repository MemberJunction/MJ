/**
 * Pure view-model derivations for the **business-user Predictions catalog** — the home surface that
 * reframes published ML models as plain-language "predictions" a non-technical Outcome Owner can browse,
 * trust, and act on. Each published model becomes a catalog card carrying the shared trust verdict
 * (`TrustVerdicts.DeriveTrustVerdict`: a rendering of the gate decision stored on the model's training run, the same
 * rule the agent's builder uses), so a model the gate did not ship, or one never evaluated under an Evaluation
 * Protocol, is visibly flagged and blocked from being opened — never silently presented as usable.
 *
 * Framework-free + deterministic (like `predictive-studio.view-models.ts`) → unit-tested with no Angular.
 */

import { TrustVerdicts, type TrustInput, type TrustVerdict } from '@memberjunction/predictive-studio-core';

/** The minimal published-model slice the catalog needs: the model and its training run's stored results. */
export interface BusinessPredictionInput extends TrustInput {
  /** The `MJ: ML Models` id. */
  modelId: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** The plain-language title (the pipeline goal the agent set, or the model display name). */
  name: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /**
   * When the model was last trained/updated, for a "last run" hint. PascalCase like the `ValidationResults` member it
   * sits beside (from `TrustInput`); the two camelCase members above keep their published names.
   */
  UpdatedAt?: Date | null;
}

/** One card in the business Predictions catalog. */
export interface BusinessPredictionCard {
  modelId: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** Plain-language title shown on the card. */
  title: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** The full trust verdict (outcome, headline, stored reason, the CanAct gate). */
  trust: TrustVerdict;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** Whether a business user can open/operate this prediction (= trust.CanAct). */
  canOpen: boolean;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  /** When not openable, the plain reason (the stored gate reason, or "not evaluated"); else null. */
  blockedReason: string | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  updatedAt: Date | null;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

/** The business catalog's cards (static members on one owner). */
export class BusinessPredictions {
  /** Map a published model into a business catalog card, applying the trust gate. */
  public static ToBusinessPredictionCard(input: BusinessPredictionInput): BusinessPredictionCard {
    const trust = TrustVerdicts.DeriveTrustVerdict(input);
    return {
      modelId: input.modelId,
      title: input.name?.trim() || 'Untitled prediction',
      trust,
      canOpen: trust.CanAct,
      blockedReason: BusinessPredictions.blockedReason(trust),
      updatedAt: input.UpdatedAt || null,
    };
  }

  /** Build the business catalog: shipped models first, then kept simple baselines, then no-signal, then not evaluated. */
  public static BuildBusinessCatalog(inputs: readonly BusinessPredictionInput[]): BusinessPredictionCard[] {
    return inputs
      .map((i) => BusinessPredictions.ToBusinessPredictionCard(i))
      .sort((a, b) => BusinessPredictions.catalogRank(a.trust) - BusinessPredictions.catalogRank(b.trust));
  }

  private static blockedReason(trust: TrustVerdict): string | null {
    if (trust.CanAct) return null;
    return trust.Kind === 'not-evaluated' ? 'Not evaluated under an Evaluation Protocol yet — an analyst needs to retrain it.' : trust.Reason;
  }

  private static catalogRank(t: TrustVerdict): number {
    switch (t.Outcome) {
      case 'model':
        return 0;
      case 'keep-simple-baseline':
        return 1;
      case 'no-signal':
        return 2;
      case null:
        return 3;
    }
  }
}
