import { IndexByUUID, UUIDMap, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import type {
  ComplianceAuditSnapshot,
  ComplianceGateResult,
  ComplianceObligations,
  EnforcementMode,
  MessageClass,
} from '@memberjunction/communication-types';
import type {
  MJCommunicationComplianceRegimeEntity,
  MJCommunicationComplianceRegimeJurisdictionEntity,
  MJCommunicationComplianceRegimeRuleEntity,
  MJCommunicationComplianceRuleTypeEntity,
  MJCommunicationPreferenceEntity,
  MJCommunicationPrincipalPreferenceEntity,
  MJCommunicationSenderEntity,
  MJCommunicationSuppressionEntity,
  MJJurisdictionMemberEntity,
} from '@memberjunction/core-entities';

export interface SimulateComplianceInput {
  Sender: MJCommunicationSenderEntity;
  AllSenders: MJCommunicationSenderEntity[];
  Preference?: MJCommunicationPreferenceEntity;
  PrincipalPreference?: MJCommunicationPrincipalPreferenceEntity;
  MessageClass: MessageClass;
  Suppressions: MJCommunicationSuppressionEntity[];
  Regimes: MJCommunicationComplianceRegimeEntity[];
  RegimeJurisdictions: MJCommunicationComplianceRegimeJurisdictionEntity[];
  RegimeRules: MJCommunicationComplianceRegimeRuleEntity[];
  RuleTypes: MJCommunicationComplianceRuleTypeEntity[];
  JurisdictionMembers: MJJurisdictionMemberEntity[];
  RecipientJurisdictionID?: string | null;
  InstanceEnforcementMode?: EnforcementMode;
}

const HARD_STOP_REASONS = new Set(['Hard Bounce', 'Invalid Address']);

/**
 * Browser-safe 5-step ComplianceGate simulator mirroring the server-side
 * `ComplianceGate.Evaluate()` pipeline.
 */
export function SimulateComplianceGate(input: SimulateComplianceInput): ComplianceGateResult {
  const mode: EnforcementMode =
    input.Sender.EnforcementMode ?? input.InstanceEnforcementMode ?? 'Enforce';
  const senderAncestors = collectSenderAncestors(input.Sender, input.AllSenders);

  const expandedRecipient = expandJurisdictions(
    input.RecipientJurisdictionID ?? null,
    input.JurisdictionMembers,
  );
  const expandedSender = expandJurisdictions(
    input.Sender.JurisdictionID ?? null,
    input.JurisdictionMembers,
  );

  const applicableRegimes = findApplicableRegimes(
    input.Regimes,
    input.RegimeJurisdictions,
    expandedRecipient,
    expandedSender,
    input.RecipientJurisdictionID ?? null,
    input.Sender.JurisdictionID ?? null,
  );

  const mergedRules = mergeRegimeRules(applicableRegimes, input.RegimeRules, input.RuleTypes);
  const obligations = buildObligations(input.Sender, mergedRules);

  const auditSnapshot: ComplianceAuditSnapshot = {
    EnforcementMode: mode,
    ApplicableRegimes: applicableRegimes.map((r) => r.Name),
    ExpandedRecipientJurisdictions: Array.from(expandedRecipient),
    ExpandedSenderJurisdictions: Array.from(expandedSender),
    MergedRules: mergedRules,
  };

  // Step 1: Suppressions
  const activeSuppressions = filterActiveSuppressions(
    input.Suppressions,
    senderAncestors,
    input.Preference?.ID ?? null,
  );
  const hardBlock = activeSuppressions.find((s) => HARD_STOP_REASONS.has(s.Reason));
  if (hardBlock) {
    return {
      Decision: 'Blocked',
      Reason: hardBlock.Reason,
      Detail: `Suppressed by ${hardBlock.Reason}`,
      SuppressionID: hardBlock.ID,
      Obligations: obligations,
      AuditSnapshot: auditSnapshot,
    };
  }

  const overridableBlock = activeSuppressions[0];
  if (overridableBlock && input.MessageClass !== 'Transactional') {
    return applyMode(
      {
        Decision: 'Blocked',
        Reason: overridableBlock.Reason,
        Detail: `Suppressed by ${overridableBlock.Reason}`,
        SuppressionID: overridableBlock.ID,
        Obligations: obligations,
        AuditSnapshot: auditSnapshot,
      },
      mode,
    );
  }

  // Step 2 & 3: Preferences & Opt-in
  if (input.Preference) {
    if (input.Preference.Status === 'Disabled') {
      return applyMode(
        {
          Decision: 'Blocked',
          Reason: 'PreferenceDisabled',
          Detail: `Preference "${input.Preference.Name}" is Disabled.`,
          Obligations: obligations,
          AuditSnapshot: auditSnapshot,
        },
        mode,
      );
    }

    const effectiveState = input.PrincipalPreference?.State ?? input.Preference.DefaultState;
    if (effectiveState === 'Opted Out') {
      return applyMode(
        {
          Decision: 'Blocked',
          Reason: 'OptedOut',
          Detail: `Principal is Opted Out of "${input.Preference.Name}".`,
          Obligations: obligations,
          AuditSnapshot: auditSnapshot,
        },
        mode,
      );
    }
    if (effectiveState === 'Pending') {
      return applyMode(
        {
          Decision: 'Blocked',
          Reason: 'PendingDoubleOptIn',
          Detail: `Principal preference "${input.Preference.Name}" is Pending confirmation.`,
          Obligations: obligations,
          AuditSnapshot: auditSnapshot,
        },
        mode,
      );
    }
  }

  return {
    Decision: 'Allowed',
    Obligations: obligations,
    AuditSnapshot: auditSnapshot,
  };
}

function collectSenderAncestors(
  sender: MJCommunicationSenderEntity,
  allSenders: MJCommunicationSenderEntity[],
): UUIDSet {
  const senderById = IndexByUUID(allSenders, (s) => s.ID);
  const set = new UUIDSet([sender.ID]);
  let current: MJCommunicationSenderEntity | undefined = sender;
  let guard = 0;
  while (current?.ParentSenderID && guard < 20) {
    guard++;
    const parent = senderById.Get(current.ParentSenderID);
    if (!parent || set.Has(parent.ID)) break;
    set.Add(parent.ID);
    current = parent;
  }
  return set;
}

function expandJurisdictions(
  rootId: string | null,
  members: MJJurisdictionMemberEntity[],
): UUIDSet {
  const result = new UUIDSet();
  if (!rootId) return result;
  const groupsByMember = new UUIDMap<string[]>();
  for (const m of members) {
    const list = groupsByMember.Get(m.MemberJurisdictionID) ?? [];
    list.push(m.GroupJurisdictionID);
    groupsByMember.Set(m.MemberJurisdictionID, list);
  }
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (result.Has(id)) continue;
    result.Add(id);
    for (const groupId of groupsByMember.Get(id) ?? []) {
      if (!result.Has(groupId)) {
        queue.push(groupId);
      }
    }
  }
  return result;
}

function findApplicableRegimes(
  regimes: MJCommunicationComplianceRegimeEntity[],
  regimeJurisdictions: MJCommunicationComplianceRegimeJurisdictionEntity[],
  expandedRecipient: UUIDSet,
  expandedSender: UUIDSet,
  recipientId: string | null,
  senderId: string | null,
): MJCommunicationComplianceRegimeEntity[] {
  const linksByRegime = new UUIDMap<MJCommunicationComplianceRegimeJurisdictionEntity[]>();
  for (const rj of regimeJurisdictions) {
    const list = linksByRegime.Get(rj.CommunicationComplianceRegimeID) ?? [];
    list.push(rj);
    linksByRegime.Set(rj.CommunicationComplianceRegimeID, list);
  }
  return regimes.filter((r) => {
    if (r.Status !== 'Active') return false;
    const links = linksByRegime.Get(r.ID) ?? [];
    const matchesRecipient = links.some((l) => expandedRecipient.Has(l.JurisdictionID));
    const matchesSender = links.some((l) => expandedSender.Has(l.JurisdictionID));

    if (r.AppliesBy === 'Recipient') {
      return matchesRecipient || (!recipientId && r.AppliesWhenJurisdictionUnknown);
    }
    if (r.AppliesBy === 'Sender') {
      return matchesSender || (!senderId && r.AppliesWhenJurisdictionUnknown);
    }
    return (
      matchesRecipient ||
      matchesSender ||
      ((!recipientId || !senderId) && r.AppliesWhenJurisdictionUnknown)
    );
  });
}

function mergeRegimeRules(
  regimes: MJCommunicationComplianceRegimeEntity[],
  rules: MJCommunicationComplianceRegimeRuleEntity[],
  ruleTypes: MJCommunicationComplianceRuleTypeEntity[],
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  const regimeIds = new UUIDSet(regimes.map((r) => r.ID));
  const ruleTypeById = IndexByUUID(ruleTypes, (t) => t.ID);
  for (const rule of rules) {
    if (rule.Status !== 'Active' || !regimeIds.Has(rule.CommunicationComplianceRegimeID)) continue;
    const rt = ruleTypeById.Get(rule.CommunicationComplianceRuleTypeID);
    const key = rt?.Name ?? rule.CommunicationComplianceRuleTypeID;
    try {
      const parsed = rule.Parameters ? (JSON.parse(rule.Parameters) as Record<string, unknown>) : {};
      out[key] = { ...(out[key] ?? {}), ...parsed };
    } catch {
      out[key] = out[key] ?? {};
    }
  }
  return out;
}

function buildObligations(
  sender: MJCommunicationSenderEntity,
  mergedRules: Record<string, Record<string, unknown>>,
): ComplianceObligations {
  const unsubRule = mergedRules['UnsubscribeMechanism'] ?? mergedRules['Unsubscribe'] ?? {};
  const idRule = mergedRules['SenderIdentification'] ?? {};
  const trackingRule = mergedRules['TrackingConsent'] ?? {};
  const requireOpenConsent = Boolean(trackingRule.requireConsentForOpenPixel ?? false);
  const requireClickConsent = Boolean(trackingRule.requireConsentForClickTracking ?? false);
  return {
    RequireOneClickHeader: Boolean(unsubRule.requireOneClickHeader ?? unsubRule.RequireOneClickHeader ?? true),
    RequireFooterUnsubscribe: Boolean(unsubRule.requireFooterUnsubscribe ?? unsubRule.RequireFooterUnsubscribe ?? true),
    RequireSenderPostalAddress: Boolean(idRule.requirePhysicalAddress ?? idRule.RequirePostalAddress ?? false),
    SenderPostalAddress: sender.PostalAddress ?? undefined,
    SenderName: sender.FromName ?? sender.Name,
    AllowOpenPixel: !requireOpenConsent,
    AllowClickTracking: !requireClickConsent,
    PreferenceCenterURL: sender.PreferenceCenterURL ?? undefined,
  };
}

function filterActiveSuppressions(
  suppressions: MJCommunicationSuppressionEntity[],
  senderAncestors: UUIDSet,
  preferenceId: string | null,
): MJCommunicationSuppressionEntity[] {
  const now = Date.now();
  return suppressions.filter((s) => {
    if (s.Status !== 'Active') return false;
    if (s.ExpiresAt && s.ExpiresAt.getTime() <= now) return false;
    if (s.CommunicationSenderID && !senderAncestors.Has(s.CommunicationSenderID)) return false;
    if (s.CommunicationPreferenceID && (!preferenceId || !UUIDsEqual(s.CommunicationPreferenceID, preferenceId))) {
      return false;
    }
    return true;
  });
}

function applyMode(result: ComplianceGateResult, mode: EnforcementMode): ComplianceGateResult {
  if (mode === 'Off') {
    return { ...result, Decision: 'Allowed', Detail: `[Mode: Off] ${result.Detail ?? ''}`.trim() };
  }
  if (mode === 'Shadow') {
    return { ...result, Decision: 'Allowed', Detail: `[Mode: Shadow — would block: ${result.Reason}]` };
  }
  return result;
}
