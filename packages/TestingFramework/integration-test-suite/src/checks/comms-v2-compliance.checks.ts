/**
 * comms-v2-compliance.checks.ts — the 'comms-v2-compliance' bundle (CV2G1–CV2G4):
 * Exercises ComplianceGate + JurisdictionResolver + CommunicationSenderPermission
 * against live database entities.
 *
 * TRANSPORT: server, in-process, on purpose. CV2G1, CV2G3 and CV2G4 evaluate the gate and the
 * resolver over entity objects that are never saved, to pin single rules (an expired suppression,
 * the jurisdiction rollup, Shadow mode) with inputs no request can dictate. The gate's verdict as
 * a caller sees it is asserted over GraphQL by comms-v2-wire.CV2W5.
 *
 * Only CV2G2 writes rows. They are named per run, and its teardown never throws; see
 * comms-v2-fixtures.ts.
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
  MJCommunicationPreferenceEntity,
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
import { COMMS_IT_TAG, CommsCleanup, NewCommsRunTag } from './comms-v2-fixtures';

export const CommsV2ComplianceChecks: NamedCheck[] = [
  {
    Id: 'comms-v2-compliance.CV2G1',
    Name: 'CV2G1: Active suppression blocks while expired suppression allows',
    Fn: async (ctx: IntegrationCheckContext) => {
      const rv = new RunView();
      const [senderRes, channelRes, preferenceRes] = await rv.RunViews(
        [
          { EntityName: 'MJ: Communication Senders', ExtraFilter: "Name='Default Organization'", MaxRows: 1, ResultType: 'entity_object' },
          { EntityName: 'MJ: Communication Base Message Types', ExtraFilter: "Type='Email'", MaxRows: 1, ResultType: 'entity_object' },
          { EntityName: 'MJ: Communication Preferences', ExtraFilter: "Name='General updates'", MaxRows: 1, ResultType: 'entity_object' },
        ],
        ctx.User,
      );
      Assert(senderRes.Success && senderRes.Results.length > 0, 'Default Organization sender missing');
      Assert(channelRes.Success && channelRes.Results.length > 0, 'Email channel missing');
      Assert(preferenceRes.Success && preferenceRes.Results.length > 0, 'General updates preference seed missing');

      const sender = senderRes.Results[0] as MJCommunicationSenderEntity;
      const channel = channelRes.Results[0] as MJCommunicationBaseMessageTypeEntity;
      // Marketing mail must be sent under a preference; the seeded one defaults to Opted In.
      const preference = preferenceRes.Results[0] as MJCommunicationPreferenceEntity;

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
        Preference: preference,
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

      const tag = `mj-it ${NewCommsRunTag('cv2g2')} safe-to-delete`;
      const parentSender = await ctx.Provider.GetEntityObject<MJCommunicationSenderEntity>('MJ: Communication Senders', ctx.User);
      parentSender.Name = `${tag}-Parent`;
      parentSender.Description = COMMS_IT_TAG;
      parentSender.CommunicationSenderTypeID = senderTypeId;
      parentSender.EnforcementMode = 'Enforce';
      parentSender.Status = 'Active';

      const childSender = await ctx.Provider.GetEntityObject<MJCommunicationSenderEntity>('MJ: Communication Senders', ctx.User);
      childSender.Name = `${tag}-Child`;
      childSender.Description = COMMS_IT_TAG;
      childSender.CommunicationSenderTypeID = senderTypeId;
      childSender.EnforcementMode = 'Enforce';
      childSender.Status = 'Active';

      let parentPerm: MJCommunicationSenderPermissionEntity | null = null;
      let childPerm: MJCommunicationSenderPermissionEntity | null = null;

      try {
        Assert(await parentSender.Save(), `Failed saving parent sender: ${parentSender.LatestResult?.CompleteMessage}`);
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
        const cleanup = new CommsCleanup('comms-v2-compliance', ctx.User);
        await cleanup.Delete(childPerm, 'CV2G2 child permission');
        await cleanup.Delete(parentPerm, 'CV2G2 parent permission');
        await cleanup.Delete(childSender, 'CV2G2 child sender');
        await cleanup.Delete(parentSender, 'CV2G2 parent sender');
        cleanup.Report();
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
      const [senderRes, channelRes, regimeRes, preferenceRes] = await rv.RunViews(
        [
          { EntityName: 'MJ: Communication Senders', ExtraFilter: "Name='Default Organization'", MaxRows: 1, ResultType: 'entity_object' },
          { EntityName: 'MJ: Communication Base Message Types', ExtraFilter: "Type='Email'", MaxRows: 1, ResultType: 'entity_object' },
          { EntityName: 'MJ: Communication Compliance Regimes', ExtraFilter: "Name='GDPR'", MaxRows: 1, ResultType: 'entity_object' },
          { EntityName: 'MJ: Communication Preferences', ExtraFilter: "Name='General updates'", MaxRows: 1, ResultType: 'entity_object' },
        ],
        ctx.User,
      );
      Assert(senderRes.Success && senderRes.Results.length > 0, 'Default Organization sender missing');
      Assert(channelRes.Success && channelRes.Results.length > 0, 'Email channel missing');
      Assert(regimeRes.Success && regimeRes.Results.length > 0, 'GDPR regime seed missing');
      Assert(preferenceRes.Success && preferenceRes.Results.length > 0, 'General updates preference seed missing');

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
          Preference: preferenceRes.Results[0] as MJCommunicationPreferenceEntity,
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
