import { UUIDMap, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import { CommunicationEngineBase } from '@memberjunction/communication-types';
import type {
  MJCommunicationComplianceRegimeEntity,
  MJCommunicationComplianceRegimeJurisdictionEntity,
  MJCommunicationComplianceRegimeRuleEntity,
  MJCommunicationComplianceRuleTypeEntity,
  MJJurisdictionEntity,
  MJJurisdictionMemberEntity,
} from '@memberjunction/core-entities';
import type { MessageClass } from '@memberjunction/communication-types';

export interface ComplianceMetadataSource {
  Jurisdictions: MJJurisdictionEntity[];
  JurisdictionMembers: MJJurisdictionMemberEntity[];
  ComplianceRegimes: MJCommunicationComplianceRegimeEntity[];
  ComplianceRuleTypes: MJCommunicationComplianceRuleTypeEntity[];
  ComplianceRegimeRules: MJCommunicationComplianceRegimeRuleEntity[];
  ComplianceRegimeJurisdictions: MJCommunicationComplianceRegimeJurisdictionEntity[];
}

export interface ActiveRegimesResult {
  Regimes: MJCommunicationComplianceRegimeEntity[];
  ExpandedRecipientJurisdictions: string[];
  ExpandedSenderJurisdictions: string[];
}

export interface GroupedComplianceRules {
  RuleType: MJCommunicationComplianceRuleTypeEntity;
  Rules: MJCommunicationComplianceRegimeRuleEntity[];
}

const JURISDICTION_TIMEZONE_MAP: Record<string, string[]> = {
  US: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'],
  'US-CA': ['America/Los_Angeles'],
  'US-TX': ['America/Chicago'],
  'US-NY': ['America/New_York'],
  'US-FL': ['America/New_York'],
  'US-IL': ['America/Chicago'],
  'US-WA': ['America/Los_Angeles'],
  CA: ['America/Toronto', 'America/Winnipeg', 'America/Edmonton', 'America/Vancouver'],
  'CA-ON': ['America/Toronto'],
  'CA-QC': ['America/Toronto'],
  'CA-BC': ['America/Vancouver'],
  GB: ['Europe/London'],
  UK: ['Europe/London'],
  AU: [
    'Australia/Sydney',
    'Australia/Melbourne',
    'Australia/Brisbane',
    'Australia/Adelaide',
    'Australia/Perth',
  ],
  'AU-NSW': ['Australia/Sydney'],
  'AU-VIC': ['Australia/Melbourne'],
  'AU-QLD': ['Australia/Brisbane'],
  'AU-WA': ['Australia/Perth'],
  DE: ['Europe/Berlin'],
  FR: ['Europe/Paris'],
  ES: ['Europe/Madrid'],
  IT: ['Europe/Rome'],
  NL: ['Europe/Amsterdam'],
  IE: ['Europe/Dublin'],
  NZ: ['Pacific/Auckland'],
  JP: ['Asia/Tokyo'],
  SG: ['Asia/Singapore'],
  IN: ['Asia/Kolkata'],
};

/**
 * Builds an in-memory JurisdictionMember containment graph for O(1) jurisdiction
 * expansion and collects active compliance regimes and rules.
 */
export class JurisdictionResolver {
  private readonly source: ComplianceMetadataSource;
  private readonly jurisdictionsById = new UUIDMap<MJJurisdictionEntity>();
  private readonly jurisdictionsByCode = new Map<string, MJJurisdictionEntity>();
  private readonly parentGroupsByMember = new UUIDMap<string[]>();
  private readonly expandedById = new UUIDMap<string[]>();
  private readonly regimeJurisdictions = new UUIDMap<UUIDSet>();
  private readonly ruleTypesById = new UUIDMap<MJCommunicationComplianceRuleTypeEntity>();

  constructor(source?: ComplianceMetadataSource) {
    this.source = source ?? CommunicationEngineBase.Instance;
    this.buildGraph();
  }

  private buildGraph(): void {
    for (const j of this.source.Jurisdictions) {
      if (j.Status !== 'Active') continue;
      this.jurisdictionsById.Set(j.ID, j);
      if (j.Code) {
        this.jurisdictionsByCode.set(j.Code.trim().toUpperCase(), j);
      }
    }

    for (const m of this.source.JurisdictionMembers) {
      if (!this.jurisdictionsById.Has(m.GroupJurisdictionID)) continue;
      const existing = this.parentGroupsByMember.Get(m.MemberJurisdictionID) ?? [];
      existing.push(m.GroupJurisdictionID);
      this.parentGroupsByMember.Set(m.MemberJurisdictionID, existing);
    }

    // Precompute O(1) expansion for every active jurisdiction
    for (const j of this.jurisdictionsById.Values()) {
      this.expandedById.Set(j.ID, this.computeAncestors(j.ID));
    }

    for (const rj of this.source.ComplianceRegimeJurisdictions) {
      let set = this.regimeJurisdictions.Get(rj.CommunicationComplianceRegimeID);
      if (!set) {
        set = new UUIDSet();
        this.regimeJurisdictions.Set(rj.CommunicationComplianceRegimeID, set);
      }
      set.Add(rj.JurisdictionID);
    }

    for (const rt of this.source.ComplianceRuleTypes) {
      if (rt.Status === 'Active') {
        this.ruleTypesById.Set(rt.ID, rt);
      }
    }
  }

  private computeAncestors(startId: string): string[] {
    const visited = new UUIDSet();
    const queue: string[] = [startId];
    const result: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.Has(current)) continue;
      visited.Add(current);
      result.push(current);

      const parents = this.parentGroupsByMember.Get(current) ?? [];
      for (const parentId of parents) {
        if (!visited.Has(parentId)) {
          queue.push(parentId);
        }
      }
    }

    return result;
  }

  public ResolveJurisdictionID(idOrCode: string | null | undefined): string | null {
    if (!idOrCode || !idOrCode.trim()) return null;
    const trimmed = idOrCode.trim();
    const byId = this.jurisdictionsById.Get(trimmed);
    if (byId) return byId.ID;
    const byCode = this.jurisdictionsByCode.get(trimmed.toUpperCase());
    return byCode ? byCode.ID : null;
  }

  public ExpandJurisdiction(idOrCode: string | null | undefined): string[] {
    const id = this.ResolveJurisdictionID(idOrCode);
    if (!id) return [];
    return this.expandedById.Get(id) ?? [id];
  }

  public GetJurisdictionCodes(jurisdictionIds: string[]): string[] {
    const codes: string[] = [];
    for (const id of jurisdictionIds) {
      const entity = this.jurisdictionsById.Get(id);
      if (entity) {
        codes.push(entity.Code);
      }
    }
    return codes;
  }

  public GetJurisdictionTimezones(idOrCode: string | null | undefined): string[] {
    const expanded = this.ExpandJurisdiction(idOrCode);
    const seen = new Set<string>();
    const zones: string[] = [];

    for (const id of expanded) {
      const entity = this.jurisdictionsById.Get(id);
      if (!entity?.Code) continue;
      const mapped = JURISDICTION_TIMEZONE_MAP[entity.Code.trim().toUpperCase()];
      if (mapped) {
        for (const tz of mapped) {
          if (!seen.has(tz)) {
            seen.add(tz);
            zones.push(tz);
          }
        }
        // Prefer the most specific jurisdiction match first (self before parent country/group)
        if (zones.length > 0) {
          return zones;
        }
      }
    }

    return zones;
  }

  public CollectActiveRegimes(params: {
    RecipientJurisdiction?: string | null;
    SenderJurisdiction?: string | null;
  }): ActiveRegimesResult {
    const expandedRecipient = this.ExpandJurisdiction(params.RecipientJurisdiction);
    const expandedSender = this.ExpandJurisdiction(params.SenderJurisdiction);
    const recipientSet = new UUIDSet(expandedRecipient);
    const senderSet = new UUIDSet(expandedSender);
    const recipientKnown = expandedRecipient.length > 0;
    const senderKnown = expandedSender.length > 0;

    const matchingRegimes: MJCommunicationComplianceRegimeEntity[] = [];

    for (const regime of this.source.ComplianceRegimes) {
      if (regime.Status !== 'Active') continue;
      const attached = this.regimeJurisdictions.Get(regime.ID);
      const matchesRecipient =
        (recipientKnown && this.intersects(attached, recipientSet)) ||
        (!recipientKnown && regime.AppliesWhenJurisdictionUnknown);
      const matchesSender =
        (senderKnown && this.intersects(attached, senderSet)) ||
        (!senderKnown && regime.AppliesWhenJurisdictionUnknown);

      const applies =
        regime.AppliesBy === 'Recipient'
          ? matchesRecipient
          : regime.AppliesBy === 'Sender'
            ? matchesSender
            : matchesRecipient || matchesSender;

      if (applies) {
        matchingRegimes.push(regime);
      }
    }

    return {
      Regimes: matchingRegimes,
      ExpandedRecipientJurisdictions: expandedRecipient,
      ExpandedSenderJurisdictions: expandedSender,
    };
  }

  public CollectRulesByType(
    regimes: MJCommunicationComplianceRegimeEntity[],
    channelID: string,
    messageClass: MessageClass,
  ): GroupedComplianceRules[] {
    const activeRegimeIds = new UUIDSet(regimes.map((r) => r.ID));
    const rulesByType = new UUIDMap<MJCommunicationComplianceRegimeRuleEntity[]>();

    for (const rule of this.source.ComplianceRegimeRules) {
      if (rule.Status !== 'Active') continue;
      if (!activeRegimeIds.Has(rule.CommunicationComplianceRegimeID)) continue;
      if (rule.BaseMessageTypeID !== null && !UUIDsEqual(rule.BaseMessageTypeID, channelID)) {
        continue;
      }
      if (rule.MessageClass !== null && rule.MessageClass !== messageClass) {
        continue;
      }

      const list = rulesByType.Get(rule.CommunicationComplianceRuleTypeID) ?? [];
      list.push(rule);
      rulesByType.Set(rule.CommunicationComplianceRuleTypeID, list);
    }

    const grouped: GroupedComplianceRules[] = [];
    for (const [ruleTypeId, rules] of rulesByType) {
      const ruleType = this.ruleTypesById.Get(ruleTypeId);
      if (ruleType) {
        grouped.push({ RuleType: ruleType, Rules: rules });
      }
    }

    return grouped;
  }

  private intersects(attached: UUIDSet | undefined, candidateSet: UUIDSet): boolean {
    if (!attached || attached.Size === 0 || candidateSet.Size === 0) {
      return false;
    }
    for (const id of candidateSet) {
      if (attached.Has(id)) {
        return true;
      }
    }
    return false;
  }
}
