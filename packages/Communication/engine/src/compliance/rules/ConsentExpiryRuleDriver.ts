import { RegisterClass } from '@memberjunction/global';
import {
  BaseComplianceRule,
  ComplianceEvalContext,
  ComplianceRuleOutcome,
} from '@memberjunction/communication-types';
import { ReadNumberParam } from './RuleParamUtils';

export interface ConsentExpiryMerged {
  MaxDays: number | null;
}

const MS_PER_DAY = 86_400_000;

/**
 * Resolves consent expiry across applicable regimes:
 * - Shortest positive `maxDays` wins.
 * - Checks `ExpiresAt` and `ConsentAt + MaxDays` against `ctx.Now`.
 */
@RegisterClass(BaseComplianceRule, 'ConsentExpiryRuleDriver')
export class ConsentExpiryRuleDriver extends BaseComplianceRule<ConsentExpiryMerged> {
  public MergeStrictest(parameterSets: ReadonlyArray<Record<string, unknown>>): ConsentExpiryMerged {
    let shortestDays: number | null = null;

    for (const params of parameterSets) {
      const maxDays = ReadNumberParam(params, 'maxDays', 'MaxDays');
      if (maxDays !== undefined && maxDays > 0) {
        shortestDays = shortestDays === null ? maxDays : Math.min(shortestDays, maxDays);
      }
    }

    return { MaxDays: shortestDays };
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
}
