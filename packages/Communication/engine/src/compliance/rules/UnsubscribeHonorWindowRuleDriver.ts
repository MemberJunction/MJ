import { RegisterClass } from '@memberjunction/global';
import {
  BaseComplianceRule,
  ComplianceEvalContext,
  ComplianceRuleOutcome,
} from '@memberjunction/communication-types';
import { ReadNumberParam } from './RuleParamUtils';

/**
 * Merged `UnsubscribeHonorWindow` requirement. Recorded in the audit snapshot only; MJ applies an
 * unsubscribe as soon as its activity event is processed.
 */
export interface UnsubscribeHonorWindowMerged {
  /**
   * Shortest number of hours within which an unsubscribe must be honored; `null` when no regime
   * sets one.
   */
  MaxHours: number | null;
}

/**
 * Resolves the unsubscribe honor window across applicable regimes:
 * - Shortest positive `maxHours` wins (recorded in audit snapshot).
 */
@RegisterClass(BaseComplianceRule, 'UnsubscribeHonorWindowRuleDriver')
export class UnsubscribeHonorWindowRuleDriver extends BaseComplianceRule<UnsubscribeHonorWindowMerged> {
  public MergeStrictest(
    parameterSets: ReadonlyArray<Record<string, unknown>>,
  ): UnsubscribeHonorWindowMerged {
    let shortestHours: number | null = null;

    for (const params of parameterSets) {
      const maxHours = ReadNumberParam(params, 'maxHours', 'MaxHours');
      if (maxHours !== undefined && maxHours > 0) {
        shortestHours = shortestHours === null ? maxHours : Math.min(shortestHours, maxHours);
      }
    }

    return { MaxHours: shortestHours };
  }

  public Evaluate(
    _merged: UnsubscribeHonorWindowMerged,
    _ctx: ComplianceEvalContext,
  ): ComplianceRuleOutcome {
    return { Passed: true };
  }
}
