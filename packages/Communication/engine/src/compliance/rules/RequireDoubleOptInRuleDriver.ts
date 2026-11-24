import { RegisterClass } from '@memberjunction/global';
import {
  BaseComplianceRule,
  ComplianceEvalContext,
  ComplianceRuleOutcome,
} from '@memberjunction/communication-types';
import { ReadBooleanParam } from './RuleParamUtils';

/** Merged `RequireDoubleOptIn` requirement. */
export interface RequireDoubleOptInMerged {
  /** Whether a confirmed (`Double`) opt-in is required. */
  Required: boolean;
}

/**
 * Resolves double opt-in requirement across applicable regimes:
 * - `true` wins over `false`.
 * - Checks `PrincipalPreference.OptInMethod === 'Double'` and `State === 'Opted In'`.
 */
@RegisterClass(BaseComplianceRule, 'RequireDoubleOptInRuleDriver')
export class RequireDoubleOptInRuleDriver extends BaseComplianceRule<RequireDoubleOptInMerged> {
  public MergeStrictest(
    parameterSets: ReadonlyArray<Record<string, unknown>>,
  ): RequireDoubleOptInMerged {
    const required = parameterSets.some(
      (params) => ReadBooleanParam(params, 'required', 'Required', 'requireDoubleOptIn') === true,
    );
    return { Required: required };
  }

  public Evaluate(
    merged: RequireDoubleOptInMerged,
    ctx: ComplianceEvalContext,
  ): ComplianceRuleOutcome {
    if (!merged.Required || ctx.MessageClass === 'Transactional') {
      return { Passed: true };
    }

    if (
      ctx.PrincipalPreference &&
      ctx.PrincipalPreference.State === 'Opted In' &&
      ctx.PrincipalPreference.OptInMethod === 'Double'
    ) {
      return { Passed: true };
    }

    return {
      Passed: false,
      Decision: 'Blocked',
      FailureReason: 'Double opt-in confirmation is required under applicable compliance regime',
    };
  }
}
