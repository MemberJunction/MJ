import { RegisterClass } from '@memberjunction/global';
import {
  BaseComplianceRule,
  ComplianceEvalContext,
  ComplianceRuleOutcome,
} from '@memberjunction/communication-types';
import { ReadBooleanParam, ReadStringParam } from './RuleParamUtils';

/**
 * Whether a tracking technique may be used: always (`'allowed'`), only for a recipient who is opted
 * in to the envelope's preference (`'consent-required'`), or never (`'prohibited'`).
 */
export type TrackingPolicy = 'allowed' | 'consent-required' | 'prohibited';

/** Merged `TrackingConsent` requirement. */
export interface TrackingConsentMerged {
  /** Policy for the open-tracking pixel. */
  OpenPixel: TrackingPolicy;
  /** Policy for click-tracking link rewriting. */
  ClickTracking: TrackingPolicy;
}

const POLICY_RANK: Record<TrackingPolicy, number> = {
  allowed: 0,
  'consent-required': 1,
  prohibited: 2,
};

function readTrackingPolicy(
  params: Record<string, unknown>,
  stringKeys: string[],
  boolKeys: string[],
  requireConsentKeys: string[] = [],
): TrackingPolicy | undefined {
  for (const key of stringKeys) {
    const val = ReadStringParam(params, key)?.toLowerCase();
    if (val === 'allowed' || val === 'consent-required' || val === 'prohibited') {
      return val;
    }
  }
  for (const key of requireConsentKeys) {
    const reqConsent = ReadBooleanParam(params, key);
    if (reqConsent === true) return 'consent-required';
    if (reqConsent === false) return 'allowed';
  }
  for (const key of boolKeys) {
    const boolVal = ReadBooleanParam(params, key);
    if (boolVal === false) return 'prohibited';
    if (boolVal === true) return 'allowed';
  }
  return undefined;
}

/**
 * Resolves tracking consent obligations across applicable regimes:
 * - `prohibited` > `consent-required` > `allowed`.
 * - Controls `AllowOpenPixel` & `AllowClickTracking`.
 */
@RegisterClass(BaseComplianceRule, 'TrackingConsentRuleDriver')
export class TrackingConsentRuleDriver extends BaseComplianceRule<TrackingConsentMerged> {
  public MergeStrictest(
    parameterSets: ReadonlyArray<Record<string, unknown>>,
  ): TrackingConsentMerged {
    let openPixel: TrackingPolicy = 'allowed';
    let clickTracking: TrackingPolicy = 'allowed';

    for (const params of parameterSets) {
      const open = readTrackingPolicy(
        params,
        ['openPixel', 'OpenPixel'],
        ['allowOpenPixel', 'AllowOpenPixel'],
        ['requireConsentForOpenPixel', 'RequireConsentForOpenPixel'],
      );
      if (open && POLICY_RANK[open] > POLICY_RANK[openPixel]) {
        openPixel = open;
      }

      const click = readTrackingPolicy(
        params,
        ['clickTracking', 'ClickTracking'],
        ['allowClickTracking', 'AllowClickTracking'],
        ['requireConsentForClickTracking', 'RequireConsentForClickTracking'],
      );
      if (click && POLICY_RANK[click] > POLICY_RANK[clickTracking]) {
        clickTracking = click;
      }
    }

    return {
      OpenPixel: openPixel,
      ClickTracking: clickTracking,
    };
  }

  public Evaluate(merged: TrackingConsentMerged, ctx: ComplianceEvalContext): ComplianceRuleOutcome {
    const hasOptInConsent = ctx.PrincipalPreference?.State === 'Opted In';

    const allowOpenPixel =
      merged.OpenPixel === 'allowed' ||
      (merged.OpenPixel === 'consent-required' && hasOptInConsent);

    const allowClickTracking =
      merged.ClickTracking === 'allowed' ||
      (merged.ClickTracking === 'consent-required' && hasOptInConsent);

    return {
      Passed: true,
      ObligationsPatch: {
        AllowOpenPixel: allowOpenPixel,
        AllowClickTracking: allowClickTracking,
      },
    };
  }
}
