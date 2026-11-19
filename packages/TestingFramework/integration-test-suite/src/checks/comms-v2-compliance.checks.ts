/**
 * comms-v2-compliance.checks.ts — the 'comms-v2-compliance' bundle (CV2G1–CV2G4):
 * Exercises ComplianceGate + JurisdictionResolver + CommunicationSenderPermission
 * against live database entities.
 */
import { randomUUID } from 'node:crypto';
import { RunView } from '@memberjunction/core';
import type {
  MJCommunicationBaseMessageTypeEntity,
  MJCommunicationComplianceRegimeEntity,
  MJCommunicationEndpointEntity,
  MJCommunicationSenderEntity,
  MJCommunicationSenderPermissionEntity,
  MJCommunicationSenderTypeEntity,
  MJCommunicationSuppressionEntity,
  MJJurisdictionEntity,
  MJJurisdictionMemberEntity,
} from '@memberjunction/core-entities';
import { ComplianceGate, JurisdictionResolver } from '@memberjunction/communication-engine';
import { UUIDSet } from '@memberjunction/global';
import {
  Assert,
  AssertEqual,
  IntegrationCheckContext,
  IntegrationCheckRegistry,
  NamedCheck,
} from '@memberjunction/testing-integration';

export const CommsV2ComplianceChecks: NamedCheck[] = [
  {
    Id: 'comms-v2-compliance.CV2G1',
    Name: 'CV2G1: Active suppression blocks while expired suppression allows',
    Fn: async (ctx: IntegrationCheckContext) => {
      const rv = new RunView();
      const [senderRes, channelRes] = await rv.RunViews(
        [
          { EntityName: 'MJ: Communication Senders', ExtraFilter: "Name='Default Organization'", MaxRows: 1, ResultType: 'entity_object' },
          { EntityName: 'MJ: Communication Base Message Types', ExtraFilter: "Type='Email'", MaxRows: 1, ResultType: 'entity_object' },
        ],
        ctx.User,
      );
      Assert(senderRes.Success && senderRes.Results.length > 0, 'Default Organization sender missing');
      Assert(channelRes.Success && channelRes.Results.length > 0, 'Email channel missing');

      const sender = senderRes.Results[0] as MJCommunicationSenderEntity;
      const channel = channelRes.Results[0] as MJCommunicationBaseMessageTypeEntity;

      const endpointId = randomUUID();
      const endpoint = await ctx.Provider.GetEntityObject<MJCommunicationEndpointEntity>(
        'MJ: Communication Endpoints',
        ctx.User,
      );
      endpoint.ID = endpointId;
      endpoint.BaseMessageTypeID = channel.ID;
      endpoint.NormalizedValue = 'cv2g1@integration.test';
      endpoint.Status = 'Active';

      const activeSupp = await ctx.Provider.GetEntityObject<MJCommunicationSuppressionEntity>(
        'MJ: Communication Suppressions',
        ctx.User,
      );
      activeSupp.CommunicationEndpointID = endpointId;
      activeSupp.Reason = 'Hard Bounce';
      activeSupp.Source = 'Admin';
      activeSupp.Status = 'Active';
      activeSupp.EffectiveAt = new Date(Date.now() - 60_000);

      const expiredSupp = await ctx.Provider.GetEntityObject<MJCommunicationSuppressionEntity>(
        'MJ: Communication Suppressions',
        ctx.User,
      );
      expiredSupp.CommunicationEndpointID = endpointId;
      expiredSupp.Reason = 'User Unsubscribe';
      expiredSupp.Source = 'Admin';
      expiredSupp.Status = 'Active';
      expiredSupp.EffectiveAt = new Date(Date.now() - 120_000);
      expiredSupp.ExpiresAt = new Date(Date.now() - 10_000);

      const gate = new ComplianceGate();
      const baseCtx = {
        Sender: sender,
        SenderAncestors: [sender.ID],
        Endpoint: endpoint,
        MessageClass: 'Marketing' as const,
        ChannelID: channel.ID,
        Now: new Date(),
      };

      const blocked = gate.Evaluate(baseCtx, { Suppressions: [activeSupp] });
      AssertEqual(blocked.Decision, 'Blocked', 'Active Hard Bounce suppression must block');

      const allowed = gate.Evaluate(baseCtx, { Suppressions: [expiredSupp] });
      AssertEqual(allowed.Decision, 'Allowed', 'Expired suppression must not block');
    },
  },
  {
    Id: 'comms-v2-compliance.CV2G2',
    Name: 'CV2G2: Sender permission hierarchy persists parent Manage and child View',
    Fn: async (ctx: IntegrationCheckContext) => {
      const rv = new RunView();
      const senderTypeRes = await rv.RunView<MJCommunicationSenderTypeEntity>(
        { EntityName: 'MJ: Communication Sender Types', MaxRows: 1, ResultType: 'entity_object' },
        ctx.User,
      );
      Assert(senderTypeRes.Success && senderTypeRes.Results.length > 0, 'Sender type seed missing');
      const senderTypeId = senderTypeRes.Results[0].ID;

      const tag = `CV2G2-${Date.now()}`;
      const parentSender = await ctx.Provider.GetEntityObject<MJCommunicationSenderEntity>('MJ: Communication Senders', ctx.User);
      parentSender.Name = `${tag}-Parent`;
      parentSender.CommunicationSenderTypeID = senderTypeId;
      parentSender.EnforcementMode = 'Enforce';
      parentSender.Status = 'Active';

      const childSender = await ctx.Provider.GetEntityObject<MJCommunicationSenderEntity>('MJ: Communication Senders', ctx.User);
      childSender.Name = `${tag}-Child`;
      childSender.CommunicationSenderTypeID = senderTypeId;
      childSender.EnforcementMode = 'Enforce';
      childSender.Status = 'Active';

      let parentPerm: MJCommunicationSenderPermissionEntity | null = null;
      let childPerm: MJCommunicationSenderPermissionEntity | null = null;

      try {
        Assert(await parentSender.Save(), `Failed saving parent sender: ${parentSender.LatestResult?.Message}`);
        childSender.ParentSenderID = parentSender.ID;
        Assert(await childSender.Save(), `Failed saving child sender: ${childSender.LatestResult?.Message}`);

        parentPerm = await ctx.Provider.GetEntityObject<MJCommunicationSenderPermissionEntity>(
          'MJ: Communication Sender Permissions',
          ctx.User,
        );
        parentPerm.CommunicationSenderID = parentSender.ID;
        parentPerm.UserID = ctx.User.ID;
        parentPerm.PermissionLevel = 'Manage';
        parentPerm.AppliesToChildSenders = true;
        Assert(await parentPerm.Save(), `Failed saving parent permission: ${parentPerm.LatestResult?.Message}`);

        const permRes = await rv.RunView<MJCommunicationSenderPermissionEntity>(
          {
            EntityName: 'MJ: Communication Sender Permissions',
            ExtraFilter: `CommunicationSenderID IN ('${parentSender.ID}','${childSender.ID}')`,
            ResultType: 'entity_object',
          },
          ctx.User,
        );
        Assert(permRes.Success && permRes.Results.length === 1, 'Expected 1 parent permission row');

        childPerm = await ctx.Provider.GetEntityObject<MJCommunicationSenderPermissionEntity>(
          'MJ: Communication Sender Permissions',
          ctx.User,
        );
        childPerm.CommunicationSenderID = childSender.ID;
        childPerm.UserID = ctx.User.ID;
        childPerm.PermissionLevel = 'View';
        childPerm.AppliesToChildSenders = false;
        Assert(await childPerm.Save(), `Failed saving child View permission: ${childPerm.LatestResult?.Message}`);
        AssertEqual(childPerm.PermissionLevel, 'View', 'Child View permission persisted');
      } finally {
        if (childPerm?.IsSaved) await childPerm.Delete();
        if (parentPerm?.IsSaved) await parentPerm.Delete();
        if (childSender.IsSaved) await childSender.Delete();
        if (parentSender.IsSaved) await parentSender.Delete();
      }
    },
  },
  {
    Id: 'comms-v2-compliance.CV2G3',
    Name: 'CV2G3: JurisdictionResolver expands US-CA into US parent jurisdiction',
    Fn: async (ctx: IntegrationCheckContext) => {
      const rv = new RunView();
      const [jurRes, memRes] = await rv.RunViews(
        [
          { EntityName: 'MJ: Jurisdictions', ResultType: 'entity_object' },
          { EntityName: 'MJ: Jurisdiction Members', ResultType: 'entity_object' },
        ],
        ctx.User,
      );
      Assert(jurRes.Success && jurRes.Results.length > 0, 'Jurisdictions seed missing');
      Assert(memRes.Success, 'Jurisdiction Members query failed');

      const jurisdictions = jurRes.Results as MJJurisdictionEntity[];
      const members = memRes.Results as MJJurisdictionMemberEntity[];
      const usCa = jurisdictions.find((j) => j.Code === 'US-CA');
      const us = jurisdictions.find((j) => j.Code === 'US');
      Assert(usCa != null && us != null, 'Expected US-CA and US jurisdiction seeds');

      const resolver = new JurisdictionResolver({
        Jurisdictions: jurisdictions,
        JurisdictionMembers: members,
        ComplianceRegimes: [],
        ComplianceRuleTypes: [],
        ComplianceRegimeRules: [],
        ComplianceRegimeJurisdictions: [],
      });
      const expanded = new UUIDSet(resolver.ExpandJurisdiction(usCa!.ID));
      Assert(expanded.Has(usCa!.ID), 'Expanded set must contain US-CA');
      Assert(expanded.Has(us!.ID), 'Expanded set must roll up to US');
    },
  },
  {
    Id: 'comms-v2-compliance.CV2G4',
    Name: 'CV2G4: ComplianceGate Shadow mode populates AuditSnapshot and starter GDPR regime defaults to Disabled',
    Fn: async (ctx: IntegrationCheckContext) => {
      const rv = new RunView();
      const [senderRes, channelRes, regimeRes] = await rv.RunViews(
        [
          { EntityName: 'MJ: Communication Senders', ExtraFilter: "Name='Default Organization'", MaxRows: 1, ResultType: 'entity_object' },
          { EntityName: 'MJ: Communication Base Message Types', ExtraFilter: "Type='Email'", MaxRows: 1, ResultType: 'entity_object' },
          { EntityName: 'MJ: Communication Compliance Regimes', ExtraFilter: "Name='GDPR'", MaxRows: 1, ResultType: 'entity_object' },
        ],
        ctx.User,
      );
      Assert(senderRes.Success && senderRes.Results.length > 0, 'Default Organization sender missing');
      Assert(channelRes.Success && channelRes.Results.length > 0, 'Email channel missing');
      Assert(regimeRes.Success && regimeRes.Results.length > 0, 'GDPR regime seed missing');

      const baseSender = senderRes.Results[0] as MJCommunicationSenderEntity;
      const channel = channelRes.Results[0] as MJCommunicationBaseMessageTypeEntity;
      const gdpr = regimeRes.Results[0] as MJCommunicationComplianceRegimeEntity;
      AssertEqual(gdpr.Status, 'Disabled', 'Shipped GDPR starter regime must default to Disabled');

      const endpoint = await ctx.Provider.GetEntityObject<MJCommunicationEndpointEntity>(
        'MJ: Communication Endpoints',
        ctx.User,
      );
      endpoint.BaseMessageTypeID = channel.ID;
      endpoint.NormalizedValue = 'cv2g4@integration.test';
      endpoint.Status = 'Active';

      const supp = await ctx.Provider.GetEntityObject<MJCommunicationSuppressionEntity>(
        'MJ: Communication Suppressions',
        ctx.User,
      );
      supp.Reason = 'User Unsubscribe';
      supp.Source = 'Admin';
      supp.Status = 'Active';
      supp.EffectiveAt = new Date(Date.now() - 60_000);

      const gate = new ComplianceGate();
      const shadowRes = gate.Evaluate(
        {
          Sender: baseSender,
          SenderAncestors: [baseSender.ID],
          Endpoint: endpoint,
          MessageClass: 'Marketing',
          ChannelID: channel.ID,
          Now: new Date(),
        },
        {
          Suppressions: [supp],
          InstanceEnforcementMode: 'Shadow',
        },
      );
      Assert(shadowRes.AuditSnapshot != null, 'AuditSnapshot must be populated');
      Assert(shadowRes.Decision === 'Blocked' || shadowRes.Decision === 'Allowed', 'Valid decision returned');
    },
  },
];

for (const check of CommsV2ComplianceChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}
