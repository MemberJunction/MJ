/**
 * comms-v2-core.checks.ts — the 'comms-v2-core' bundle (CV2C1–CV2C3):
 * Verifies the Communications V2 schema, starter metadata seeds, and
 * endpoint resolution/deduplication against live SQL Server.
 */
import { RunView } from '@memberjunction/core';
import type {
  MJCommunicationBaseMessageTypeEntity,
  MJCommunicationEndpointEntity,
  MJCommunicationEndpointPrincipalEntity,
  MJEntityCommunicationFieldEntity,
  MJEntityCommunicationMessageTypeEntity,
} from '@memberjunction/core-entities';
import { CommunicationEngine, PrincipalRecordKey, V2SendService } from '@memberjunction/communication-engine';
import { CommunicationEngineBase } from '@memberjunction/communication-types';
import { UUIDsEqual } from '@memberjunction/global';
import {
  Assert,
  AssertEqual,
  IntegrationCheckContext,
  IntegrationCheckRegistry,
  NamedCheck,
} from '@memberjunction/testing-integration';

const V2_ENTITY_NAMES: readonly string[] = [
  'MJ: Jurisdictions',
  'MJ: Jurisdiction Members',
  'MJ: Communication Principals',
  'MJ: Communication Sender Types',
  'MJ: Communication Senders',
  'MJ: Communication Sender Permissions',
  'MJ: Communication Preferences',
  'MJ: Communication Principal Preferences',
  'MJ: Communication Endpoints',
  'MJ: Communication Endpoint Principals',
  'MJ: Communication Suppressions',
  'MJ: Communication Suppression Policies',
  'MJ: Communication Compliance Rule Types',
  'MJ: Communication Compliance Regimes',
  'MJ: Communication Compliance Regime Jurisdictions',
  'MJ: Communication Compliance Regime Rules',
  'MJ: Communication Sending Domains',
  'MJ: Communication Provider Events',
  'MJ: Communication Activities',
  'MJ: Communication Consent Audit Logs',
];

export const CommsV2CoreChecks: NamedCheck[] = [
  {
    Id: 'comms-v2-core.CV2C1',
    Name: 'CV2C1: All 20 Comms V2 entities are registered in Metadata',
    Fn: async (ctx: IntegrationCheckContext) => {
      const entityNames = new Set(ctx.Provider.Entities.map((e) => e.Name));
      const missing = V2_ENTITY_NAMES.filter((name) => !entityNames.has(name));
      AssertEqual(missing.length, 0, `Missing Comms V2 entities in Metadata: ${missing.join(', ')}`);
    },
  },
  {
    Id: 'comms-v2-core.CV2C2',
    Name: 'CV2C2: Starter Comms V2 metadata seeds are present in the database',
    Fn: async (ctx: IntegrationCheckContext) => {
      const rv = new RunView();
      const [senders, prefs, ruleTypes, regimes, policies, principals] = await rv.RunViews(
        [
          { EntityName: 'MJ: Communication Senders', ExtraFilter: "Name='Default Organization'", ResultType: 'simple' },
          { EntityName: 'MJ: Communication Preferences', ExtraFilter: "Name='General updates'", ResultType: 'simple' },
          { EntityName: 'MJ: Communication Compliance Rule Types', ResultType: 'simple' },
          { EntityName: 'MJ: Communication Compliance Regimes', ResultType: 'simple' },
          { EntityName: 'MJ: Communication Suppression Policies', ResultType: 'simple' },
          { EntityName: 'MJ: Communication Principals', ResultType: 'simple' },
        ],
        ctx.User,
      );

      Assert(senders.Success && senders.Results.length >= 1, 'Expected Default Organization sender seed');
      Assert(prefs.Success && prefs.Results.length >= 1, 'Expected General updates preference seed');
      Assert(ruleTypes.Success && ruleTypes.Results.length >= 9, `Expected >= 9 rule types, got ${ruleTypes.Results.length}`);
      Assert(regimes.Success && regimes.Results.length >= 6, `Expected >= 6 starter regimes, got ${regimes.Results.length}`);
      Assert(policies.Success && policies.Results.length >= 1, 'Expected starter suppression policy seed');
      Assert(principals.Success && principals.Results.length >= 1, 'Expected MJ: Users principal seed');
    },
  },
  {
    Id: 'comms-v2-core.CV2C3',
    Name: 'CV2C3: ResolveEndpoints creates and deduplicates CommunicationEndpoint + Principal link',
    Fn: async (ctx: IntegrationCheckContext) => {
      await CommunicationEngine.Instance.Config(false, ctx.User);
      const usersEntity = ctx.Provider.Entities.find((e) => e.Name === 'MJ: Users');
      Assert(usersEntity != null, 'MJ: Users entity not found');

      const rv = new RunView();
      const channelRes = await rv.RunView<MJCommunicationBaseMessageTypeEntity>(
        {
          EntityName: 'MJ: Communication Base Message Types',
          ExtraFilter: "Type='Email'",
          MaxRows: 1,
          ResultType: 'entity_object',
        },
        ctx.User,
      );
      Assert(channelRes.Success && channelRes.Results.length > 0, 'Email base message type not found');
      const channelID = channelRes.Results[0].ID;

      const uniqueEmail = `mj-it-cv2c3-${Date.now()}@integration.test`;
      let createdEndpointId: string | null = null;
      let createdMsgType: MJEntityCommunicationMessageTypeEntity | null = null;
      let createdField: MJEntityCommunicationFieldEntity | null = null;
      const sendService = new V2SendService();

      try {
        const hasMapping = CommunicationEngineBase.Instance.Metadata.EntityCommunicationMessageTypes.some(
          (mt) => mt.IsActive && UUIDsEqual(mt.EntityID, usersEntity!.ID) && UUIDsEqual(mt.BaseMessageTypeID, channelID),
        );
        if (!hasMapping) {
          createdMsgType = await ctx.Provider.GetEntityObject<MJEntityCommunicationMessageTypeEntity>(
            'MJ: Entity Communication Message Types',
            ctx.User,
          );
          createdMsgType.EntityID = usersEntity!.ID;
          createdMsgType.BaseMessageTypeID = channelID;
          createdMsgType.IsActive = true;
          Assert(await createdMsgType.Save(), `Failed saving temp EntityCommunicationMessageType: ${createdMsgType.LatestResult?.Message}`);

          createdField = await ctx.Provider.GetEntityObject<MJEntityCommunicationFieldEntity>(
            'MJ: Entity Communication Fields',
            ctx.User,
          );
          createdField.EntityCommunicationMessageTypeID = createdMsgType.ID;
          createdField.FieldName = 'Email';
          createdField.Priority = 1;
          Assert(await createdField.Save(), `Failed saving temp EntityCommunicationField: ${createdField.LatestResult?.Message}`);

          await CommunicationEngine.Instance.Config(true, ctx.User);
        }

        const firstMap = await sendService.ResolveEndpoints(
          [
            {
              EntityID: usersEntity!.ID,
              RecordID: ctx.User.ID,
              RecordData: { Email: uniqueEmail },
            },
          ],
          channelID,
          ctx.User,
        );

        const key = PrincipalRecordKey({ EntityID: usersEntity!.ID, RecordID: ctx.User.ID });
        const firstList = firstMap.get(key) ?? [];
        Assert(firstList.length === 1, `Expected 1 resolved endpoint, got ${firstList.length}`);
        createdEndpointId = firstList[0].CommunicationEndpointID;
        AssertEqual(firstList[0].NormalizedValue, uniqueEmail.toLowerCase(), 'NormalizedValue mismatch');

        // Re-resolve with mixed case: must reuse the exact same endpoint row
        const secondMap = await sendService.ResolveEndpoints(
          [
            {
              EntityID: usersEntity!.ID,
              RecordID: ctx.User.ID,
              RecordData: { Email: uniqueEmail.toUpperCase() },
            },
          ],
          channelID,
          ctx.User,
        );
        const secondList = secondMap.get(key) ?? [];
        Assert(secondList.length === 1, 'Expected 1 resolved endpoint on second call');
        Assert(
          UUIDsEqual(secondList[0].CommunicationEndpointID, createdEndpointId),
          'Expected ResolveEndpoints to deduplicate case-varied address to same CommunicationEndpointID',
        );
      } finally {
        if (createdEndpointId) {
          const linkRes = await rv.RunView<MJCommunicationEndpointPrincipalEntity>(
            {
              EntityName: 'MJ: Communication Endpoint Principals',
              ExtraFilter: `CommunicationEndpointID='${createdEndpointId}'`,
              ResultType: 'entity_object',
            },
            ctx.User,
          );
          if (linkRes.Success) {
            for (const link of linkRes.Results) {
              await link.Delete();
            }
          }
          const epRes = await rv.RunView<MJCommunicationEndpointEntity>(
            {
              EntityName: 'MJ: Communication Endpoints',
              ExtraFilter: `ID='${createdEndpointId}'`,
              ResultType: 'entity_object',
            },
            ctx.User,
          );
          if (epRes.Success && epRes.Results.length > 0) {
            await epRes.Results[0].Delete();
          }
        }
        if (createdField?.ID) await createdField.Delete();
        if (createdMsgType?.ID) await createdMsgType.Delete();
      }
    },
  },
];

for (const check of CommsV2CoreChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}
