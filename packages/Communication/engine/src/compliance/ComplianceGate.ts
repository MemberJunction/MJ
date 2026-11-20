import { MJGlobal, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import {
  BaseComplianceRule,
  ComplianceAuditSnapshot,
  ComplianceEvalContext,
  ComplianceGateResult,
  ComplianceObligations,
  ComplianceRuleOutcome,
  EnforcementMode,
  MessageClass,
  SuppressionReason,
} from '@memberjunction/communication-types';
import type { MJCommunicationSuppressionEntity } from '@memberjunction/core-entities';
import { JurisdictionResolver } from './JurisdictionResolver';
import type { QuietHoursEvalContext } from './rules/QuietHoursRuleDriver';

export interface ComplianceGateEvalOptions {
  Suppressions: MJCommunicationSuppressionEntity[];
  RecipientJurisdiction?: string | null;
  SenderJurisdiction?: string | null;
  InstanceEnforcementMode?: EnforcementMode;
  UnsubscribeURL?: string;
}

interface SuppressionEvaluation {
  HardBlock?: MJCommunicationSuppressionEntity;
  OverridableBlock?: MJCommunicationSuppressionEntity;
}

interface RegimeEvaluation {
  BlockedReason?: string;
  QuietHoursDeferral?: ComplianceRuleOutcome;
  Obligations: ComplianceObligations;
  ApplicableRegimes: string[];
  ExpandedRecipientJurisdictions: string[];
  ExpandedSenderJurisdictions: string[];
  MergedRules: Record<string, Record<string, unknown>>;
}

const ALL_CLASSES: ReadonlySet<MessageClass> = new Set([
  'Transactional',
  'Operational',
  'Marketing',
]);
const NON_TRANSACTIONAL_CLASSES: ReadonlySet<MessageClass> = new Set([
  'Operational',
  'Marketing',
]);

/**
 * 5-step compliance gate:
 * 1. Suppressions (never reads Endpoint.Status)
 * 2. Regimes (expands jurisdictions, merges 9 rule types)
 * 3. Preferences (runs only when PreferenceID is set; handles Pending + Option B override)
 * 4. QuietHours (Deferred + DeferUntil)
 * 5. Result (EnforcementMode Off/Shadow/Enforce; Hard Bounce / Invalid Address always blocked)
 */
export class ComplianceGate {
  private readonly resolver: JurisdictionResolver;

  constructor(resolver?: JurisdictionResolver) {
    this.resolver = resolver ?? new JurisdictionResolver();
  }

  public Evaluate(
    ctx: ComplianceEvalContext,
    options: ComplianceGateEvalOptions,
  ): ComplianceGateResult {
    const enforcementMode: EnforcementMode =
      ctx.Sender.EnforcementMode ?? options.InstanceEnforcementMode ?? 'Enforce';

    // Step 1: Endpoint status & Suppressions
    const endpointBlock = this.evaluateEndpointStatus(ctx);
    const suppressionResult = this.evaluateSuppressions(ctx, options.Suppressions);
    const senderJurisdiction = options.SenderJurisdiction ?? ctx.Sender.JurisdictionID ?? null;

    // Step 2: Regimes
    const regimeResult = this.evaluateRegimes(
      ctx,
      options.RecipientJurisdiction ?? null,
      senderJurisdiction,
      options.UnsubscribeURL,
    );

    const auditSnapshot: ComplianceAuditSnapshot = {
      EnforcementMode: enforcementMode,
      ApplicableRegimes: regimeResult.ApplicableRegimes,
      ExpandedRecipientJurisdictions: regimeResult.ExpandedRecipientJurisdictions,
      ExpandedSenderJurisdictions: regimeResult.ExpandedSenderJurisdictions,
      MergedRules: regimeResult.MergedRules,
    };

    if (endpointBlock?.IsTerminal) {
      return this.applyEnforcementMode(
        {
          Decision: 'Blocked',
          Reason: endpointBlock.Reason,
          Detail: endpointBlock.Detail,
          Obligations: regimeResult.Obligations,
          AuditSnapshot: auditSnapshot,
        },
        endpointBlock.Reason,
      );
    }

    if (suppressionResult.HardBlock) {
      return this.applyEnforcementMode(
        {
          Decision: 'Blocked',
          Reason: suppressionResult.HardBlock.Reason,
          Detail: `Suppressed by ${suppressionResult.HardBlock.Reason}`,
          SuppressionID: suppressionResult.HardBlock.ID,
          Obligations: regimeResult.Obligations,
          AuditSnapshot: auditSnapshot,
        },
        suppressionResult.HardBlock.Reason,
      );
    }

    if (endpointBlock) {
      return this.applyEnforcementMode(
        {
          Decision: 'Blocked',
          Reason: endpointBlock.Reason,
          Detail: endpointBlock.Detail,
          Obligations: regimeResult.Obligations,
          AuditSnapshot: auditSnapshot,
        },
        endpointBlock.Reason,
      );
    }

    // Step 3: Preferences & Option B override
    const prefBlock = this.evaluatePreferences(
      ctx,
      suppressionResult.OverridableBlock,
      regimeResult.MergedRules,
      auditSnapshot,
    );
    if (prefBlock) {
      return this.applyEnforcementMode({
        Decision: 'Blocked',
        Reason: prefBlock.Reason,
        Detail: prefBlock.Detail,
        SuppressionID: prefBlock.SuppressionID,
        Obligations: regimeResult.Obligations,
        AuditSnapshot: auditSnapshot,
      });
    }

    if (regimeResult.BlockedReason) {
      return this.applyEnforcementMode({
        Decision: 'Blocked',
        Reason: 'ComplianceRegime',
        Detail: regimeResult.BlockedReason,
        Obligations: regimeResult.Obligations,
        AuditSnapshot: auditSnapshot,
      });
    }

    // Step 4: QuietHours
    if (regimeResult.QuietHoursDeferral && regimeResult.QuietHoursDeferral.DeferUntil) {
      return this.applyEnforcementMode({
        Decision: 'Deferred',
        Reason: 'QuietHours',
        Detail: regimeResult.QuietHoursDeferral.FailureReason,
        DeferUntil: regimeResult.QuietHoursDeferral.DeferUntil,
        Obligations: regimeResult.Obligations,
        AuditSnapshot: auditSnapshot,
      });
    }

    // Step 5: Allowed
    return {
      Decision: 'Allowed',
      Obligations: regimeResult.Obligations,
      AuditSnapshot: auditSnapshot,
    };
  }

  private evaluateEndpointStatus(
    ctx: ComplianceEvalContext,
  ): { Reason: SuppressionReason | 'Erased'; Detail: string; IsTerminal: boolean } | null {
    switch (ctx.Endpoint.Status) {
      case 'Hard Bounced':
        return {
          Reason: 'Hard Bounce',
          Detail: 'Endpoint status is Hard Bounced',
          IsTerminal: true,
        };
      case 'Invalid':
        return {
          Reason: 'Invalid Address',
          Detail: 'Endpoint status is Invalid',
          IsTerminal: true,
        };
      case 'Erased':
        return {
          Reason: 'Erased',
          Detail: 'Endpoint status is Erased',
          IsTerminal: true,
        };
      case 'Complained':
        if (NON_TRANSACTIONAL_CLASSES.has(ctx.MessageClass)) {
          return {
            Reason: 'Spam Complaint',
            Detail: 'Endpoint status is Complained',
            IsTerminal: false,
          };
        }
        return null;
      default:
        return null;
    }
  }

  private evaluateSuppressions(
    ctx: ComplianceEvalContext,
    suppressions: MJCommunicationSuppressionEntity[],
  ): SuppressionEvaluation {
    const senderChain = new UUIDSet([ctx.Sender.ID, ...ctx.SenderAncestors]);
    const nowMs = ctx.Now.getTime();
    let overridable: MJCommunicationSuppressionEntity | undefined;
    let hardBlock: MJCommunicationSuppressionEntity | undefined;

    for (const s of suppressions) {
      if (s.Status !== 'Active') continue;
      if (s.ExpiresAt && s.ExpiresAt.getTime() <= nowMs) continue;
      if (!this.matchesTarget(s, ctx)) continue;
      if (s.CommunicationSenderID !== null && !senderChain.Has(s.CommunicationSenderID)) continue;
      if (s.BaseMessageTypeID !== null && !UUIDsEqual(s.BaseMessageTypeID, ctx.ChannelID)) continue;
      if (
        s.CommunicationPreferenceID !== null &&
        (!ctx.Preference || !UUIDsEqual(s.CommunicationPreferenceID, ctx.Preference.ID))
      ) {
        continue;
      }
      if (!this.reasonCoversMessage(s, ctx.MessageClass)) continue;

      if (s.Reason === 'User Unsubscribe' && s.CommunicationPreferenceID === null) {
        overridable = overridable ?? s;
        continue;
      }

      if (s.Reason === 'Hard Bounce' || s.Reason === 'Invalid Address') {
        return { HardBlock: s };
      }
      hardBlock = hardBlock ?? s;
    }

    if (hardBlock) {
      return { HardBlock: hardBlock };
    }
    return { OverridableBlock: overridable };
  }

  private matchesTarget(s: MJCommunicationSuppressionEntity, ctx: ComplianceEvalContext): boolean {
    if (s.CommunicationEndpointID !== null && UUIDsEqual(s.CommunicationEndpointID, ctx.Endpoint.ID)) {
      return true;
    }
    if (
      ctx.Principal &&
      s.EntityID !== null &&
      UUIDsEqual(s.EntityID, ctx.Principal.EntityID) &&
      s.RecordID === ctx.Principal.RecordID
    ) {
      return true;
    }
    return false;
  }

  private reasonCoversMessage(
    s: MJCommunicationSuppressionEntity,
    messageClass: MessageClass,
  ): boolean {
    switch (s.Reason) {
      case 'Hard Bounce':
      case 'Invalid Address':
        return ALL_CLASSES.has(messageClass);
      case 'Spam Complaint':
      case 'Admin Block':
        return NON_TRANSACTIONAL_CLASSES.has(messageClass);
      case 'User Unsubscribe':
      case 'Policy':
        return s.CommunicationPreferenceID !== null || messageClass === 'Marketing';
      default:
        return false;
    }
  }

  private evaluateRegimes(
    ctx: ComplianceEvalContext,
    recipientJurisdiction: string | null,
    senderJurisdiction: string | null,
    unsubscribeURL?: string,
  ): RegimeEvaluation {
    const active = this.resolver.CollectActiveRegimes({
      RecipientJurisdiction: recipientJurisdiction,
      SenderJurisdiction: senderJurisdiction,
    });
    const groupedRules = this.resolver.CollectRulesByType(
      active.Regimes,
      ctx.ChannelID,
      ctx.MessageClass,
    );

    const obligations: ComplianceObligations = {
      RequireOneClickHeader: false,
      RequireFooterUnsubscribe: false,
      RequireSenderPostalAddress: false,
      SenderPostalAddress: ctx.Sender.PostalAddress ?? undefined,
      SenderName: ctx.Sender.FromName ?? ctx.Sender.Name ?? undefined,
      AllowOpenPixel: true,
      AllowClickTracking: true,
      UnsubscribeURL: unsubscribeURL,
      PreferenceCenterURL: ctx.Sender.PreferenceCenterURL ?? undefined,
    };

    const mergedRules: Record<string, Record<string, unknown>> = {};
    const jurisdictionTimezones = this.resolver.GetJurisdictionTimezones(recipientJurisdiction);
    let blockedReason: string | undefined;
    let quietHoursDeferral: ComplianceRuleOutcome | undefined;

    for (const group of groupedRules) {
      const driver = this.instantiateRuleDriver(group.RuleType.DriverClass);
      if (!driver) continue;

      const paramSets = group.Rules.map((r) => this.parseRuleParams(r.Parameters));
      const merged = driver.MergeStrictest(paramSets);
      mergedRules[group.RuleType.Name] = merged;

      const evalCtx: QuietHoursEvalContext = {
        ...ctx,
        JurisdictionTimezones: jurisdictionTimezones,
      };
      const outcome = driver.Evaluate(merged, evalCtx);
      if (outcome.ObligationsPatch) {
        Object.assign(obligations, outcome.ObligationsPatch);
      }
      if (!outcome.Passed) {
        if (outcome.Decision === 'Deferred') {
          quietHoursDeferral = outcome;
        } else if (!blockedReason) {
          blockedReason = outcome.FailureReason ?? `Blocked by ${group.RuleType.Name}`;
        }
      }
    }

    return {
      BlockedReason: blockedReason,
      QuietHoursDeferral: quietHoursDeferral,
      Obligations: obligations,
      ApplicableRegimes: active.Regimes.map((r) => r.Name),
      ExpandedRecipientJurisdictions: this.resolver.GetJurisdictionCodes(
        active.ExpandedRecipientJurisdictions,
      ),
      ExpandedSenderJurisdictions: this.resolver.GetJurisdictionCodes(
        active.ExpandedSenderJurisdictions,
      ),
      MergedRules: mergedRules,
    };
  }

  private evaluatePreferences(
    ctx: ComplianceEvalContext,
    overridableSuppression: MJCommunicationSuppressionEntity | undefined,
    mergedRules: Record<string, Record<string, unknown>>,
    auditSnapshot: ComplianceAuditSnapshot,
  ): { Reason: string; Detail: string; SuppressionID?: string } | null {
    if (!ctx.Preference) {
      if (overridableSuppression) {
        return {
          Reason: overridableSuppression.Reason,
          Detail: 'Blocked by User Unsubscribe suppression',
          SuppressionID: overridableSuppression.ID,
        };
      }
      return null;
    }

    if (ctx.Preference.Status === 'Disabled') {
      return {
        Reason: 'PreferenceDisabled',
        Detail: `Preference '${ctx.Preference.Name}' is disabled`,
      };
    }

    const pp = ctx.PrincipalPreference;
    if (pp) {
      if (pp.State === 'Pending') {
        if (ctx.MessageClass === 'Marketing' || ctx.MessageClass === 'Operational') {
          return {
            Reason: 'DoubleOptInPending',
            Detail: 'Double opt-in confirmation is pending',
          };
        }
        return null;
      }

      if (pp.State === 'Opted Out') {
        return {
          Reason: 'OptedOut',
          Detail: `Principal opted out of preference '${ctx.Preference.Name}'`,
        };
      }

      // State === 'Opted In'
      if (overridableSuppression) {
        if (this.canApplyOptionBOverride(pp, overridableSuppression)) {
          auditSnapshot.OverrideApplied = 'OptionB:PreferenceResubscribe';
          return null;
        }
        return {
          Reason: overridableSuppression.Reason,
          Detail: 'User Unsubscribe suppression not overridden by preference consent',
          SuppressionID: overridableSuppression.ID,
        };
      }

      return null;
    }

    // No PrincipalPreference row
    if (overridableSuppression) {
      return {
        Reason: overridableSuppression.Reason,
        Detail: 'Blocked by User Unsubscribe suppression',
        SuppressionID: overridableSuppression.ID,
      };
    }

    const consentRule = mergedRules['ConsentModel'];
    const isSoftOptInAllowed =
      consentRule?.Model === 'opt-in' &&
      consentRule?.SoftOptIn === true &&
      ctx.PrincipalAttributes?.IsExistingCustomer === true;

    if (!isSoftOptInAllowed && ctx.Preference.DefaultState === 'Opted Out') {
      return {
        Reason: 'OptedOut',
        Detail: `Preference '${ctx.Preference.Name}' defaults to Opted Out`,
      };
    }

    return null;
  }

  private canApplyOptionBOverride(
    pp: NonNullable<ComplianceEvalContext['PrincipalPreference']>,
    suppression: MJCommunicationSuppressionEntity,
  ): boolean {
    if (pp.ConsentAt.getTime() <= suppression.EffectiveAt.getTime()) {
      return false;
    }
    if (pp.ConsentSource !== 'Signup Form' && pp.ConsentSource !== 'Preference Center') {
      return false;
    }
    return pp.OptInMethod === 'Double' || pp.CommunicationLogID !== null;
  }

  private applyEnforcementMode(
    result: ComplianceGateResult,
    suppressionReason?: SuppressionReason | 'Erased',
  ): ComplianceGateResult {
    const isHardBounceOrInvalid =
      suppressionReason === 'Hard Bounce' ||
      suppressionReason === 'Invalid Address' ||
      suppressionReason === 'Erased';

    if (isHardBounceOrInvalid || result.AuditSnapshot.EnforcementMode === 'Enforce') {
      return result;
    }

    if (result.AuditSnapshot.EnforcementMode === 'Shadow') {
      return {
        Decision: 'Allowed',
        Reason: result.Reason,
        Detail: `Shadow mode: would have ${result.Decision} (${result.Detail ?? result.Reason ?? 'policy'})`,
        SuppressionID: result.SuppressionID,
        Obligations: result.Obligations,
        AuditSnapshot: result.AuditSnapshot,
      };
    }

    // EnforcementMode === 'Off'
    return {
      Decision: 'Allowed',
      Obligations: result.Obligations,
      AuditSnapshot: result.AuditSnapshot,
    };
  }

  private instantiateRuleDriver(driverClass: string): BaseComplianceRule | null {
    const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseComplianceRule>(
      BaseComplianceRule,
      driverClass,
    );
    if (!instance || instance.constructor === BaseComplianceRule) {
      return null;
    }
    return instance;
  }

  private parseRuleParams(raw: string | null): Record<string, unknown> {
    if (!raw || !raw.trim()) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
}
