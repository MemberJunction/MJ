import { RegisterClass } from '@memberjunction/global';
import {
  BaseComplianceRule,
  ComplianceEvalContext,
  ComplianceRuleOutcome,
} from '@memberjunction/communication-types';
import { ReadBooleanParam } from './RuleParamUtils';

export interface ConsentEvidenceMerged {
  RequireSource: boolean;
  RequireTimestamp: boolean;
  RequireConsentText: boolean;
}

/**
 * Resolves consent evidence requirements across applicable regimes:
 * - `true` wins per field (`source`, `timestamp`, `consentText`).
 */
@RegisterClass(BaseComplianceRule, 'ConsentEvidenceRuleDriver')
export class ConsentEvidenceRuleDriver extends BaseComplianceRule<ConsentEvidenceMerged> {
  public MergeStrictest(
    parameterSets: ReadonlyArray<Record<string, unknown>>,
  ): ConsentEvidenceMerged {
    let requireSource = false;
    let requireTimestamp = false;
    let requireConsentText = false;

    for (const params of parameterSets) {
      if (ReadBooleanParam(params, 'requireSource', 'RequireSource', 'source', 'Source') === true) {
        requireSource = true;
      }
      if (
        ReadBooleanParam(params, 'requireTimestamp', 'RequireTimestamp', 'timestamp', 'Timestamp') ===
        true
      ) {
        requireTimestamp = true;
      }
      if (
        ReadBooleanParam(
          params,
          'requireConsentText',
          'RequireConsentText',
          'consentText',
          'ConsentText',
        ) === true
      ) {
        requireConsentText = true;
      }
    }

    return {
      RequireSource: requireSource,
      RequireTimestamp: requireTimestamp,
      RequireConsentText: requireConsentText,
    };
  }

  public Evaluate(merged: ConsentEvidenceMerged, ctx: ComplianceEvalContext): ComplianceRuleOutcome {
    if (ctx.MessageClass === 'Transactional') {
      return { Passed: true };
    }

    if (!merged.RequireSource && !merged.RequireTimestamp && !merged.RequireConsentText) {
      return { Passed: true };
    }

    if (!ctx.PrincipalPreference) {
      return {
        Passed: false,
        Decision: 'Blocked',
        FailureReason: 'Consent evidence is required but no principal preference record exists',
      };
    }

    const missing: string[] = [];
    if (merged.RequireSource && !ctx.PrincipalPreference.ConsentSource) {
      missing.push('ConsentSource');
    }
    if (merged.RequireTimestamp && !ctx.PrincipalPreference.ConsentAt) {
      missing.push('ConsentAt');
    }
    if (
      merged.RequireConsentText &&
      (!ctx.PrincipalPreference.ConsentText || ctx.PrincipalPreference.ConsentText.trim().length === 0)
    ) {
      missing.push('ConsentText');
    }

    if (missing.length > 0) {
      return {
        Passed: false,
        Decision: 'Blocked',
        FailureReason: `Required consent evidence missing: ${missing.join(', ')}`,
      };
    }

    return { Passed: true };
  }
}
