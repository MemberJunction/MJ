import { RegisterClass } from '@memberjunction/global';
import {
  BaseComplianceRule,
  ComplianceEvalContext,
  ComplianceRuleOutcome,
} from '@memberjunction/communication-types';
import { ReadBooleanParam, ReadNumberParam } from './RuleParamUtils';

/** Merged `ConsentExpiry` requirement. */
export interface ConsentExpiryMerged {
  /** Days after `ConsentAt` that consent stays valid; `null` for no limit. */
  MaxDays: number | null;
  /** When `true`, `MaxDays` expires only implied consent, not an express opt-in. */
  ImpliedOnly: boolean;
}

const MS_PER_DAY = 86_400_000;

/**
 * Resolves consent expiry across applicable regimes:
 * - Shortest positive `maxDays` wins.
 * - When `impliedOnly: true`, `maxDays` only expires implied consent (not express opt-ins).
 * - Checks `ExpiresAt` and `ConsentAt + MaxDays` against `ctx.Now`.
 */
@RegisterClass(BaseComplianceRule, 'ConsentExpiryRuleDriver')
export class ConsentExpiryRuleDriver extends BaseComplianceRule<ConsentExpiryMerged> {
  public MergeStrictest(parameterSets: ReadonlyArray<Record<string, unknown>>): ConsentExpiryMerged {
    let shortestDays: number | null = null;
    let allImpliedOnly = parameterSets.length > 0;

    for (const params of parameterSets) {
      const maxDays = ReadNumberParam(params, 'maxDays', 'MaxDays');
      if (maxDays !== undefined && maxDays > 0) {
        shortestDays = shortestDays === null ? maxDays : Math.min(shortestDays, maxDays);
      }
      if (ReadBooleanParam(params, 'impliedOnly', 'ImpliedOnly') !== true) {
        allImpliedOnly = false;
      }
    }

    return { MaxDays: shortestDays, ImpliedOnly: allImpliedOnly };
  }

  public Evaluate(merged: ConsentExpiryMerged, ctx: ComplianceEvalContext): ComplianceRuleOutcome {
    if (ctx.MessageClass === 'Transactional' || !ctx.PrincipalPreference) {
      return { Passed: true };
    }

    const nowMs = ctx.Now.getTime();
    if (ctx.PrincipalPreference.ExpiresAt && ctx.PrincipalPreference.ExpiresAt.getTime() <= nowMs) {
      return {
        Passed: false,
        Decision: 'Blocked',
        FailureReason: 'Consent has expired (ExpiresAt)',
      };
    }

    if (merged.MaxDays !== null && ctx.PrincipalPreference.ConsentAt) {
      if (merged.ImpliedOnly && this.isExpressConsent(ctx.PrincipalPreference)) {
        return { Passed: true };
      }
      const expiresAtMs = ctx.PrincipalPreference.ConsentAt.getTime() + merged.MaxDays * MS_PER_DAY;
      if (expiresAtMs <= nowMs) {
        return {
          Passed: false,
          Decision: 'Blocked',
          FailureReason: `Consent has exceeded maximum validity of ${merged.MaxDays} days`,
        };
      }
    }

    return { Passed: true };
  }

  private isExpressConsent(pp: NonNullable<ComplianceEvalContext['PrincipalPreference']>): boolean {
    return (
      pp.OptInMethod === 'Single' ||
      pp.OptInMethod === 'Double' ||
      pp.ConsentSource === 'Signup Form' ||
      pp.ConsentSource === 'Preference Center'
    );
  }
}
