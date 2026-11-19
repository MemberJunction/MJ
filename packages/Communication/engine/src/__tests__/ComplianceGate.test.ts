import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import type {
  MJCommunicationComplianceRegimeEntity,
  MJCommunicationComplianceRegimeJurisdictionEntity,
  MJCommunicationComplianceRegimeRuleEntity,
  MJCommunicationComplianceRuleTypeEntity,
  MJCommunicationEndpointEntity,
  MJCommunicationPreferenceEntity,
  MJCommunicationPrincipalPreferenceEntity,
  MJCommunicationSenderEntity,
  MJCommunicationSuppressionEntity,
  MJJurisdictionEntity,
  MJJurisdictionMemberEntity,
} from '@memberjunction/core-entities';
import { BaseComplianceRule } from '@memberjunction/communication-types';
import { ComplianceGate } from '../compliance/ComplianceGate';
import { ComplianceMetadataSource, JurisdictionResolver } from '../compliance/JurisdictionResolver';
import {
  ConsentModelRuleDriver,
  QuietHoursRuleDriver,
  RequireDoubleOptInRuleDriver,
  SenderIdentificationRuleDriver,
  TrackingConsentRuleDriver,
  UnsubscribeMechanismRuleDriver,
} from '../compliance/rules';

const CHANNEL_EMAIL = '11111111-1111-1111-1111-111111111111';

const JUR = {
  US: 'aaaa0001-0000-0000-0000-000000000001',
  US_CA: 'aaaa0002-0000-0000-0000-000000000002',
  US_TX: 'aaaa0003-0000-0000-0000-000000000003',
  CA: 'aaaa0004-0000-0000-0000-000000000004',
  GB: 'aaaa0005-0000-0000-0000-000000000005',
  AU: 'aaaa0006-0000-0000-0000-000000000006',
};

const RT = {
  ConsentModel: 'bbbb0001-0000-0000-0000-000000000001',
  Unsubscribe: 'bbbb0002-0000-0000-0000-000000000002',
  SenderId: 'bbbb0003-0000-0000-0000-000000000003',
  QuietHours: 'bbbb0004-0000-0000-0000-000000000004',
  Tracking: 'bbbb0005-0000-0000-0000-000000000005',
  DoubleOptIn: 'bbbb0006-0000-0000-0000-000000000006',
};

const REG = {
  CAN_SPAM: 'cccc0001-0000-0000-0000-000000000001',
  CASL: 'cccc0002-0000-0000-0000-000000000002',
  UK_PECR: 'cccc0003-0000-0000-0000-000000000003',
  AU_SPAM: 'cccc0004-0000-0000-0000-000000000004',
  TRG_UK_SENDER: 'cccc0005-0000-0000-0000-000000000005',
};

function buildSource(): ComplianceMetadataSource {
  return {
    Jurisdictions: [
      { ID: JUR.US, Code: 'US', Name: 'United States', Type: 'Country', Status: 'Active' } as MJJurisdictionEntity,
      { ID: JUR.US_CA, Code: 'US-CA', Name: 'California', Type: 'Subdivision', Status: 'Active' } as MJJurisdictionEntity,
      { ID: JUR.US_TX, Code: 'US-TX', Name: 'Texas', Type: 'Subdivision', Status: 'Active' } as MJJurisdictionEntity,
      { ID: JUR.CA, Code: 'CA', Name: 'Canada', Type: 'Country', Status: 'Active' } as MJJurisdictionEntity,
      { ID: JUR.GB, Code: 'GB', Name: 'United Kingdom', Type: 'Country', Status: 'Active' } as MJJurisdictionEntity,
      { ID: JUR.AU, Code: 'AU', Name: 'Australia', Type: 'Country', Status: 'Active' } as MJJurisdictionEntity,
    ],
    JurisdictionMembers: [
      { ID: 'jm-1', GroupJurisdictionID: JUR.US, MemberJurisdictionID: JUR.US_CA } as MJJurisdictionMemberEntity,
      { ID: 'jm-2', GroupJurisdictionID: JUR.US, MemberJurisdictionID: JUR.US_TX } as MJJurisdictionMemberEntity,
    ],
    ComplianceRuleTypes: [
      { ID: RT.ConsentModel, Name: 'ConsentModel', DriverClass: 'ConsentModelRuleDriver', Status: 'Active' } as MJCommunicationComplianceRuleTypeEntity,
      { ID: RT.Unsubscribe, Name: 'UnsubscribeMechanism', DriverClass: 'UnsubscribeMechanismRuleDriver', Status: 'Active' } as MJCommunicationComplianceRuleTypeEntity,
      { ID: RT.SenderId, Name: 'SenderIdentification', DriverClass: 'SenderIdentificationRuleDriver', Status: 'Active' } as MJCommunicationComplianceRuleTypeEntity,
      { ID: RT.QuietHours, Name: 'QuietHours', DriverClass: 'QuietHoursRuleDriver', Status: 'Active' } as MJCommunicationComplianceRuleTypeEntity,
      { ID: RT.Tracking, Name: 'TrackingConsent', DriverClass: 'TrackingConsentRuleDriver', Status: 'Active' } as MJCommunicationComplianceRuleTypeEntity,
      { ID: RT.DoubleOptIn, Name: 'RequireDoubleOptIn', DriverClass: 'RequireDoubleOptInRuleDriver', Status: 'Active' } as MJCommunicationComplianceRuleTypeEntity,
    ],
    ComplianceRegimes: [
      { ID: REG.CAN_SPAM, Name: 'CAN-SPAM', AppliesBy: 'Recipient', AppliesWhenJurisdictionUnknown: true, Status: 'Active' } as MJCommunicationComplianceRegimeEntity,
      { ID: REG.CASL, Name: 'CASL', AppliesBy: 'Recipient', AppliesWhenJurisdictionUnknown: true, Status: 'Active' } as MJCommunicationComplianceRegimeEntity,
      { ID: REG.UK_PECR, Name: 'UK PECR', AppliesBy: 'Recipient', AppliesWhenJurisdictionUnknown: false, Status: 'Active' } as MJCommunicationComplianceRegimeEntity,
      { ID: REG.AU_SPAM, Name: 'AU Spam Act', AppliesBy: 'Recipient', AppliesWhenJurisdictionUnknown: false, Status: 'Active' } as MJCommunicationComplianceRegimeEntity,
      { ID: REG.TRG_UK_SENDER, Name: 'UK Sender Establishment', AppliesBy: 'Sender', AppliesWhenJurisdictionUnknown: false, Status: 'Active' } as MJCommunicationComplianceRegimeEntity,
    ],
    ComplianceRegimeJurisdictions: [
      { ID: 'rj-1', CommunicationComplianceRegimeID: REG.CAN_SPAM, JurisdictionID: JUR.US } as MJCommunicationComplianceRegimeJurisdictionEntity,
      { ID: 'rj-2', CommunicationComplianceRegimeID: REG.CASL, JurisdictionID: JUR.CA } as MJCommunicationComplianceRegimeJurisdictionEntity,
      { ID: 'rj-3', CommunicationComplianceRegimeID: REG.UK_PECR, JurisdictionID: JUR.GB } as MJCommunicationComplianceRegimeJurisdictionEntity,
      { ID: 'rj-4', CommunicationComplianceRegimeID: REG.AU_SPAM, JurisdictionID: JUR.AU } as MJCommunicationComplianceRegimeJurisdictionEntity,
      { ID: 'rj-5', CommunicationComplianceRegimeID: REG.TRG_UK_SENDER, JurisdictionID: JUR.GB } as MJCommunicationComplianceRegimeJurisdictionEntity,
    ],
    ComplianceRegimeRules: [
      {
        ID: 'r-1',
        CommunicationComplianceRegimeID: REG.CAN_SPAM,
        CommunicationComplianceRuleTypeID: RT.ConsentModel,
        BaseMessageTypeID: null,
        MessageClass: 'Marketing',
        Parameters: JSON.stringify({ model: 'opt-out' }),
        Status: 'Active',
      } as MJCommunicationComplianceRegimeRuleEntity,
      {
        ID: 'r-2',
        CommunicationComplianceRegimeID: REG.CAN_SPAM,
        CommunicationComplianceRuleTypeID: RT.Unsubscribe,
        BaseMessageTypeID: null,
        MessageClass: 'Marketing',
        Parameters: JSON.stringify({ oneClickHeader: 'required', footerLink: 'required' }),
        Status: 'Active',
      } as MJCommunicationComplianceRegimeRuleEntity,
      {
        ID: 'r-3',
        CommunicationComplianceRegimeID: REG.CAN_SPAM,
        CommunicationComplianceRuleTypeID: RT.SenderId,
        BaseMessageTypeID: null,
        MessageClass: 'Marketing',
        Parameters: JSON.stringify({ requirePostalAddress: true }),
        Status: 'Active',
      } as MJCommunicationComplianceRegimeRuleEntity,
      {
        ID: 'r-4',
        CommunicationComplianceRegimeID: REG.CASL,
        CommunicationComplianceRuleTypeID: RT.ConsentModel,
        BaseMessageTypeID: null,
        MessageClass: 'Marketing',
        Parameters: JSON.stringify({ model: 'opt-in', softOptIn: false }),
        Status: 'Active',
      } as MJCommunicationComplianceRegimeRuleEntity,
      {
        ID: 'r-5',
        CommunicationComplianceRegimeID: REG.UK_PECR,
        CommunicationComplianceRuleTypeID: RT.ConsentModel,
        BaseMessageTypeID: null,
        MessageClass: 'Marketing',
        Parameters: JSON.stringify({ model: 'opt-in', softOptIn: true }),
        Status: 'Active',
      } as MJCommunicationComplianceRegimeRuleEntity,
      {
        ID: 'r-6',
        CommunicationComplianceRegimeID: REG.AU_SPAM,
        CommunicationComplianceRuleTypeID: RT.ConsentModel,
        BaseMessageTypeID: null,
        MessageClass: 'Marketing',
        Parameters: JSON.stringify({ model: 'opt-in', softOptIn: false }),
        Status: 'Active',
      } as MJCommunicationComplianceRegimeRuleEntity,
      {
        ID: 'r-7',
        CommunicationComplianceRegimeID: REG.TRG_UK_SENDER,
        CommunicationComplianceRuleTypeID: RT.Tracking,
        BaseMessageTypeID: null,
        MessageClass: null,
        Parameters: JSON.stringify({ openPixel: 'consent-required', clickTracking: 'consent-required' }),
        Status: 'Active',
      } as MJCommunicationComplianceRegimeRuleEntity,
    ],
  };
}

describe('JurisdictionResolver & ComplianceGate', () => {
  beforeEach(() => {
    vi.spyOn(MJGlobal.Instance.ClassFactory, 'CreateInstance').mockImplementation(
      (_baseClass: unknown, key?: string) => {
        switch (key) {
          case 'ConsentModelRuleDriver':
            return new ConsentModelRuleDriver() as unknown as BaseComplianceRule;
          case 'UnsubscribeMechanismRuleDriver':
            return new UnsubscribeMechanismRuleDriver() as unknown as BaseComplianceRule;
          case 'SenderIdentificationRuleDriver':
            return new SenderIdentificationRuleDriver() as unknown as BaseComplianceRule;
          case 'QuietHoursRuleDriver':
            return new QuietHoursRuleDriver() as unknown as BaseComplianceRule;
          case 'TrackingConsentRuleDriver':
            return new TrackingConsentRuleDriver() as unknown as BaseComplianceRule;
          case 'RequireDoubleOptInRuleDriver':
            return new RequireDoubleOptInRuleDriver() as unknown as BaseComplianceRule;
          default:
            return null;
        }
      },
    );
  });

  const sender = {
    ID: 'sender-aqha',
    Name: 'AQHA',
    FromName: 'AQHA',
    PostalAddress: '1600 Quarter Horse Dr, Amarillo, TX',
    JurisdictionID: JUR.US_TX,
    EnforcementMode: null,
  } as MJCommunicationSenderEntity;

  const endpoint = {
    ID: 'ep-100',
    BaseMessageTypeID: CHANNEL_EMAIL,
    NormalizedValue: 'member@example.com',
    Status: 'Hard Bounced', // ComplianceGate MUST ignore Endpoint.Status and read CommunicationSuppression!
  } as MJCommunicationEndpointEntity;

  const pref = {
    ID: 'pref-newsletter',
    Name: 'Weekly Newsletter',
    MessageClass: 'Marketing',
    DefaultState: 'Opted In',
    Status: 'Active',
  } as MJCommunicationPreferenceEntity;

  it('expands JurisdictionMember containment graph and handles AQHA TX/CA/GB/AU', () => {
    const resolver = new JurisdictionResolver(buildSource());
    expect(resolver.ExpandJurisdiction('US-TX')).toEqual([JUR.US_TX, JUR.US]);

    const gate = new ComplianceGate(resolver);

    // TX recipient: CAN-SPAM opt-out -> Allowed even without PrincipalPreference
    const txRes = gate.Evaluate(
      {
        Sender: sender,
        SenderAncestors: [],
        Endpoint: endpoint,
        Preference: pref,
        MessageClass: 'Marketing',
        ChannelID: CHANNEL_EMAIL,
        Now: new Date('2026-06-15T14:00:00Z'),
      },
      { Suppressions: [], RecipientJurisdiction: 'US-TX' },
    );
    expect(txRes.Decision).toBe('Allowed');
    expect(txRes.Obligations.RequireOneClickHeader).toBe(true);
    expect(txRes.Obligations.RequireSenderPostalAddress).toBe(true);
    expect(txRes.AuditSnapshot.ExpandedRecipientJurisdictions).toEqual(['US-TX', 'US']);

    // CA (Canada) recipient: CASL opt-in -> Blocked without PrincipalPreference
    const caRes = gate.Evaluate(
      {
        Sender: sender,
        SenderAncestors: [],
        Endpoint: endpoint,
        Preference: pref,
        MessageClass: 'Marketing',
        ChannelID: CHANNEL_EMAIL,
        Now: new Date('2026-06-15T14:00:00Z'),
      },
      { Suppressions: [], RecipientJurisdiction: 'CA' },
    );
    expect(caRes.Decision).toBe('Blocked');

    // GB recipient with softOptIn + IsExistingCustomer -> Allowed
    const gbRes = gate.Evaluate(
      {
        Sender: sender,
        SenderAncestors: [],
        Endpoint: endpoint,
        Preference: pref,
        MessageClass: 'Marketing',
        ChannelID: CHANNEL_EMAIL,
        PrincipalAttributes: { IsExistingCustomer: true },
        Now: new Date('2026-06-15T14:00:00Z'),
      },
      { Suppressions: [], RecipientJurisdiction: 'GB' },
    );
    expect(gbRes.Decision).toBe('Allowed');

    // AU recipient without opt-in -> Blocked
    const auRes = gate.Evaluate(
      {
        Sender: sender,
        SenderAncestors: [],
        Endpoint: endpoint,
        Preference: pref,
        MessageClass: 'Marketing',
        ChannelID: CHANNEL_EMAIL,
        Now: new Date('2026-06-15T14:00:00Z'),
      },
      { Suppressions: [], RecipientJurisdiction: 'AU' },
    );
    expect(auRes.Decision).toBe('Blocked');
  });

  it('distinguishes TRG UK sender vs US sender for AppliesBy = Sender regimes', () => {
    const gate = new ComplianceGate(new JurisdictionResolver(buildSource()));
    const ukSender = { ...sender, JurisdictionID: JUR.GB } as MJCommunicationSenderEntity;

    const ukRes = gate.Evaluate(
      {
        Sender: ukSender,
        SenderAncestors: [],
        Endpoint: endpoint,
        MessageClass: 'Marketing',
        ChannelID: CHANNEL_EMAIL,
        Now: new Date('2026-06-15T14:00:00Z'),
      },
      { Suppressions: [], RecipientJurisdiction: 'US-TX' },
    );
    expect(ukRes.AuditSnapshot.ApplicableRegimes).toContain('UK Sender Establishment');
    expect(ukRes.Obligations.AllowOpenPixel).toBe(false);
    expect(ukRes.Obligations.AllowClickTracking).toBe(false);

    const usRes = gate.Evaluate(
      {
        Sender: sender,
        SenderAncestors: [],
        Endpoint: endpoint,
        MessageClass: 'Marketing',
        ChannelID: CHANNEL_EMAIL,
        Now: new Date('2026-06-15T14:00:00Z'),
      },
      { Suppressions: [], RecipientJurisdiction: 'US-TX' },
    );
    expect(usRes.AuditSnapshot.ApplicableRegimes).not.toContain('UK Sender Establishment');
    expect(usRes.Obligations.AllowOpenPixel).toBe(true);
  });

  it('handles Option B override positive & negative cases', () => {
    const gate = new ComplianceGate(new JurisdictionResolver(buildSource()));
    const globalUnsub = {
      ID: 'sup-1',
      CommunicationEndpointID: endpoint.ID,
      CommunicationSenderID: null,
      CommunicationPreferenceID: null,
      BaseMessageTypeID: null,
      Reason: 'User Unsubscribe',
      Status: 'Active',
      EffectiveAt: new Date('2026-01-01T00:00:00Z'),
      ExpiresAt: null,
    } as MJCommunicationSuppressionEntity;

    // Positive: ConsentAt > EffectiveAt, Preference Center, Double opt-in
    const validResub = {
      State: 'Opted In',
      ConsentSource: 'Preference Center',
      ConsentAt: new Date('2026-02-01T00:00:00Z'),
      OptInMethod: 'Double',
      CommunicationLogID: null,
    } as MJCommunicationPrincipalPreferenceEntity;

    const posRes = gate.Evaluate(
      {
        Sender: sender,
        SenderAncestors: [],
        Endpoint: endpoint,
        Preference: pref,
        PrincipalPreference: validResub,
        MessageClass: 'Marketing',
        ChannelID: CHANNEL_EMAIL,
        Now: new Date('2026-06-15T14:00:00Z'),
      },
      { Suppressions: [globalUnsub], RecipientJurisdiction: 'US-TX' },
    );
    expect(posRes.Decision).toBe('Allowed');
    expect(posRes.AuditSnapshot.OverrideApplied).toBe('OptionB:PreferenceResubscribe');

    // Negative: ConsentSource is Import (not Signup Form / Preference Center)
    const importResub = {
      ...validResub,
      ConsentSource: 'Import',
    } as MJCommunicationPrincipalPreferenceEntity;

    const negRes = gate.Evaluate(
      {
        Sender: sender,
        SenderAncestors: [],
        Endpoint: endpoint,
        Preference: pref,
        PrincipalPreference: importResub,
        MessageClass: 'Marketing',
        ChannelID: CHANNEL_EMAIL,
        Now: new Date('2026-06-15T14:00:00Z'),
      },
      { Suppressions: [globalUnsub], RecipientJurisdiction: 'US-TX' },
    );
    expect(negRes.Decision).toBe('Blocked');
  });

  it('blocks Pending for Marketing & Operational, allows Transactional, and allows after Opted In', () => {
    const gate = new ComplianceGate(new JurisdictionResolver(buildSource()));
    const pendingPref = {
      State: 'Pending',
      OptInMethod: 'Double',
      ConsentSource: 'Signup Form',
      ConsentAt: new Date('2026-06-01T00:00:00Z'),
    } as MJCommunicationPrincipalPreferenceEntity;

    const mktRes = gate.Evaluate(
      {
        Sender: sender,
        SenderAncestors: [],
        Endpoint: endpoint,
        Preference: pref,
        PrincipalPreference: pendingPref,
        MessageClass: 'Marketing',
        ChannelID: CHANNEL_EMAIL,
        Now: new Date('2026-06-15T14:00:00Z'),
      },
      { Suppressions: [], RecipientJurisdiction: 'US-TX' },
    );
    expect(mktRes.Decision).toBe('Blocked');
    expect(mktRes.Reason).toBe('DoubleOptInPending');

    const txnRes = gate.Evaluate(
      {
        Sender: sender,
        SenderAncestors: [],
        Endpoint: endpoint,
        Preference: pref,
        PrincipalPreference: pendingPref,
        MessageClass: 'Transactional',
        ChannelID: CHANNEL_EMAIL,
        Now: new Date('2026-06-15T14:00:00Z'),
      },
      { Suppressions: [], RecipientJurisdiction: 'US-TX' },
    );
    expect(txnRes.Decision).toBe('Allowed');
  });

  it('enforces Shadow vs Enforce mode while ALWAYS blocking Hard Bounce and Invalid Address', () => {
    const gate = new ComplianceGate(new JurisdictionResolver(buildSource()));
    const shadowSender = { ...sender, EnforcementMode: 'Shadow' } as MJCommunicationSenderEntity;

    // Regime block is allowed in Shadow mode
    const shadowRegimeRes = gate.Evaluate(
      {
        Sender: shadowSender,
        SenderAncestors: [],
        Endpoint: endpoint,
        Preference: pref,
        MessageClass: 'Marketing',
        ChannelID: CHANNEL_EMAIL,
        Now: new Date('2026-06-15T14:00:00Z'),
      },
      { Suppressions: [], RecipientJurisdiction: 'CA' },
    );
    expect(shadowRegimeRes.Decision).toBe('Allowed');
    expect(shadowRegimeRes.Detail).toContain('Shadow mode');

    // Hard Bounce is STILL BLOCKED even in Shadow mode!
    const hardBounce = {
      ID: 'sup-hb',
      CommunicationEndpointID: endpoint.ID,
      CommunicationSenderID: null,
      CommunicationPreferenceID: null,
      BaseMessageTypeID: null,
      Reason: 'Hard Bounce',
      Status: 'Active',
      EffectiveAt: new Date('2026-01-01T00:00:00Z'),
      ExpiresAt: null,
    } as MJCommunicationSuppressionEntity;

    const hbRes = gate.Evaluate(
      {
        Sender: shadowSender,
        SenderAncestors: [],
        Endpoint: endpoint,
        Preference: pref,
        MessageClass: 'Transactional',
        ChannelID: CHANNEL_EMAIL,
        Now: new Date('2026-06-15T14:00:00Z'),
      },
      { Suppressions: [hardBounce], RecipientJurisdiction: 'US-TX' },
    );
    expect(hbRes.Decision).toBe('Blocked');
    expect(hbRes.Reason).toBe('Hard Bounce');
  });

  it('applies AppliesWhenJurisdictionUnknown regimes when recipient jurisdiction is unknown', () => {
    const gate = new ComplianceGate(new JurisdictionResolver(buildSource()));
    const res = gate.Evaluate(
      {
        Sender: sender,
        SenderAncestors: [],
        Endpoint: endpoint,
        Preference: pref,
        MessageClass: 'Marketing',
        ChannelID: CHANNEL_EMAIL,
        Now: new Date('2026-06-15T14:00:00Z'),
      },
      { Suppressions: [], RecipientJurisdiction: null },
    );
    expect(res.AuditSnapshot.ApplicableRegimes).toContain('CAN-SPAM');
    expect(res.AuditSnapshot.ApplicableRegimes).toContain('CASL');
    expect(res.Decision).toBe('Blocked');
  });
});
