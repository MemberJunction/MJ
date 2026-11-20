import { RegisterClass } from '@memberjunction/global';
import {
  BaseComplianceRule,
  ComplianceEvalContext,
  ComplianceRuleOutcome,
} from '@memberjunction/communication-types';
import { ReadBooleanParam, ReadStringParam } from './RuleParamUtils';

export type UnsubscribeRequirementLevel = 'none' | 'optional' | 'required';

export interface UnsubscribeMechanismMerged {
  OneClickHeader: UnsubscribeRequirementLevel;
  FooterLink: UnsubscribeRequirementLevel;
}

const LEVEL_RANK: Record<UnsubscribeRequirementLevel, number> = {
  none: 0,
  optional: 1,
  required: 2,
};

function readLevel(
  params: Record<string, unknown>,
  ...keys: string[]
): UnsubscribeRequirementLevel | undefined {
  const str = ReadStringParam(params, ...keys)?.toLowerCase();
  if (str === 'required' || str === 'optional' || str === 'none') {
    return str;
  }
  const bool = ReadBooleanParam(params, ...keys);
  if (bool === true) return 'required';
  if (bool === false) return 'none';
  return undefined;
}

/**
 * Resolves unsubscribe mechanism obligations across applicable regimes:
 * - `required` beats `optional`, which beats `none`, for `oneClickHeader` and `footerLink`.
 */
@RegisterClass(BaseComplianceRule, 'UnsubscribeMechanismRuleDriver')
export class UnsubscribeMechanismRuleDriver extends BaseComplianceRule<UnsubscribeMechanismMerged> {
  public MergeStrictest(
    parameterSets: ReadonlyArray<Record<string, unknown>>,
  ): UnsubscribeMechanismMerged {
    let oneClickHeader: UnsubscribeRequirementLevel = 'none';
    let footerLink: UnsubscribeRequirementLevel = 'none';

    for (const params of parameterSets) {
      const header = readLevel(params, 'oneClickHeader', 'OneClickHeader');
      if (header && LEVEL_RANK[header] > LEVEL_RANK[oneClickHeader]) {
        oneClickHeader = header;
      }
      const footer = readLevel(params, 'footerLink', 'FooterLink');
      if (footer && LEVEL_RANK[footer] > LEVEL_RANK[footerLink]) {
        footerLink = footer;
      }
    }

    return {
      OneClickHeader: oneClickHeader,
      FooterLink: footerLink,
    };
  }

  public Evaluate(
    merged: UnsubscribeMechanismMerged,
    ctx: ComplianceEvalContext,
  ): ComplianceRuleOutcome {
    if (ctx.MessageClass === 'Transactional') {
      return {
        Passed: true,
        ObligationsPatch: {
          RequireOneClickHeader: false,
          RequireFooterUnsubscribe: false,
        },
      };
    }

    return {
      Passed: true,
      ObligationsPatch: {
        RequireOneClickHeader: merged.OneClickHeader === 'required',
        RequireFooterUnsubscribe: merged.FooterLink === 'required',
      },
    };
  }
}
