import { RegisterClass } from '@memberjunction/global';
import {
  BaseComplianceRule,
  ComplianceEvalContext,
  ComplianceRuleOutcome,
} from '@memberjunction/communication-types';
import { ReadBooleanParam, ReadStringParam } from './RuleParamUtils';

/** Merged `ConsentModel` requirement. */
export interface ConsentModelMerged {
  /** `'opt-in'` when any applicable regime requires prior consent, else `'opt-out'`. */
  Model: 'opt-in' | 'opt-out';
  /**
   * Whether an existing customer may be sent to without a recorded opt-in. `true` only when every
   * opt-in regime allows it.
   */
  SoftOptIn: boolean;
}

/**
 * Resolves consent model across applicable regimes:
 * - `opt-in` beats `opt-out`.
 * - Any other `model` value throws, which blocks the send (fail closed).
 * - `softOptIn` is preserved only if all applicable `opt-in` regimes allow it.
 */
@RegisterClass(BaseComplianceRule, 'ConsentModelRuleDriver')
export class ConsentModelRuleDriver extends BaseComplianceRule<ConsentModelMerged> {
  public MergeStrictest(parameterSets: ReadonlyArray<Record<string, unknown>>): ConsentModelMerged {
    const optInSets: Array<{ SoftOptIn: boolean }> = [];

    for (const params of parameterSets) {
      const rawModel = ReadStringParam(params, 'model', 'Model')?.toLowerCase();
      if (rawModel === 'opt-in') {
        const softOptIn = ReadBooleanParam(params, 'softOptIn', 'SoftOptIn') === true;
        optInSets.push({ SoftOptIn: softOptIn });
      } else if (rawModel !== 'opt-out') {
        // A missing or misspelled model ('optin', 'Opt In') must not silently become opt-out:
        // the gate turns this error into a block for the whole rule.
        throw new Error(
          `ConsentModel 'model' must be 'opt-in' or 'opt-out'; got ${rawModel === undefined ? 'nothing' : `'${rawModel}'`}`,
        );
      }
    }

    if (optInSets.length > 0) {
      return {
        Model: 'opt-in',
        SoftOptIn: optInSets.every((s) => s.SoftOptIn),
      };
    }

    return {
      Model: 'opt-out',
      SoftOptIn: false,
    };
  }

  public Evaluate(merged: ConsentModelMerged, ctx: ComplianceEvalContext): ComplianceRuleOutcome {
    if (ctx.MessageClass === 'Transactional' || merged.Model === 'opt-out') {
      return { Passed: true };
    }

    if (ctx.PrincipalPreference?.State === 'Opted In') {
      return { Passed: true };
    }

    if (
      !ctx.PrincipalPreference &&
      merged.SoftOptIn &&
      ctx.PrincipalAttributes?.IsExistingCustomer === true
    ) {
      return { Passed: true };
    }

    return {
      Passed: false,
      Decision: 'Blocked',
      FailureReason: 'Explicit opt-in consent is required under applicable compliance regime',
    };
  }
}
