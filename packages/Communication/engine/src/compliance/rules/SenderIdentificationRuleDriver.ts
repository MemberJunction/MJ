import { RegisterClass } from '@memberjunction/global';
import {
  BaseComplianceRule,
  ComplianceEvalContext,
  ComplianceRuleOutcome,
} from '@memberjunction/communication-types';
import { ReadBooleanParam } from './RuleParamUtils';

export interface SenderIdentificationMerged {
  RequirePostalAddress: boolean;
  RequireSenderName: boolean;
}

/**
 * Resolves sender identification obligations across applicable regimes:
 * - `true` wins for `requirePostalAddress` and `requireSenderName`.
 */
@RegisterClass(BaseComplianceRule, 'SenderIdentificationRuleDriver')
export class SenderIdentificationRuleDriver extends BaseComplianceRule<SenderIdentificationMerged> {
  public MergeStrictest(
    parameterSets: ReadonlyArray<Record<string, unknown>>,
  ): SenderIdentificationMerged {
    let requirePostalAddress = false;
    let requireSenderName = false;

    for (const params of parameterSets) {
      if (ReadBooleanParam(params, 'requirePostalAddress', 'RequirePostalAddress') === true) {
        requirePostalAddress = true;
      }
      if (ReadBooleanParam(params, 'requireSenderName', 'RequireSenderName') === true) {
        requireSenderName = true;
      }
    }

    return {
      RequirePostalAddress: requirePostalAddress,
      RequireSenderName: requireSenderName,
    };
  }

  public Evaluate(
    merged: SenderIdentificationMerged,
    ctx: ComplianceEvalContext,
  ): ComplianceRuleOutcome {
    const senderName = ctx.Sender.FromName?.trim() || ctx.Sender.Name?.trim() || undefined;
    const postalAddress = ctx.Sender.PostalAddress?.trim() || undefined;

    if (ctx.MessageClass !== 'Transactional') {
      if (merged.RequirePostalAddress && !postalAddress) {
        return {
          Passed: false,
          Decision: 'Blocked',
          FailureReason: 'Sender postal address is required by applicable compliance regime',
        };
      }
      if (merged.RequireSenderName && !senderName) {
        return {
          Passed: false,
          Decision: 'Blocked',
          FailureReason: 'Sender name is required by applicable compliance regime',
        };
      }
    }

    return {
      Passed: true,
      ObligationsPatch: {
        RequireSenderPostalAddress:
          ctx.MessageClass === 'Transactional' ? false : merged.RequirePostalAddress,
        SenderPostalAddress: postalAddress,
        SenderName: senderName,
      },
    };
  }
}
