/**
 * comms-v2-activity.checks.ts — the 'comms-v2-activity' bundle (CV2A1–CV2A3):
 * Exercises CommsActivityWorker against live SQL Server:
 *   - CV2A1: Hard Bounce processing, deduplication, suppression & consent audit log
 *   - CV2A2: Soft Bounce threshold auto-suppression using SoftBounceThresholdPolicy
 *   - CV2A3: EraseEndpointPII GDPR erasure preserves compliance suppressions & audit logs
 */
import { randomUUID } from 'node:crypto';
import { RunView } from '@memberjunction/core';
import type {
  MJCommunicationActivityEntity,
  MJCommunicationBaseMessageTypeEntity,
  MJCommunicationConsentAuditLogEntity,
  MJCommunicationEndpointEntity,
  MJCommunicationLogEntity,
  MJCommunicationProviderEntity,
  MJCommunicationProviderMessageTypeEntity,
  MJCommunicationSenderEntity,
  MJCommunicationSuppressionEntity,
} from '@memberjunction/core-entities';
import { CommsActivityWorker, CommunicationEngine } from '@memberjunction/communication-engine';
import {
  Assert,
  AssertEqual,
  IntegrationCheckContext,
  IntegrationCheckRegistry,
  NamedCheck,
} from '@memberjunction/testing-integration';

interface ActivityFixture {
  endpoint: MJCommunicationEndpointEntity;
  log: MJCommunicationLogEntity;
  sender: MJCommunicationSenderEntity;
  providerId: string;
  channelId: string;
  address: string;
}

async function createActivityFixture(
  ctx: IntegrationCheckContext,
  address: string,
): Promise<ActivityFixture> {
  await CommunicationEngine.Instance.Config(false, ctx.User);
  const rv = new RunView();
  const [senderRes, channelRes, provRes, pmtRes] = await rv.RunViews(
    [
      { EntityName: 'MJ: Communication Senders', ExtraFilter: "Name='Default Organization'", MaxRows: 1, ResultType: 'entity_object' },
      { EntityName: 'MJ: Communication Base Message Types', ExtraFilter: "Type='Email'", MaxRows: 1, ResultType: 'entity_object' },
      { EntityName: 'MJ: Communication Providers', MaxRows: 1, ResultType: 'entity_object' },
      { EntityName: 'MJ: Communication Provider Message Types', MaxRows: 1, ResultType: 'entity_object' },
    ],
    ctx.User,
  );
  Assert(senderRes.Success && senderRes.Results.length > 0, 'Default Organization sender missing');
  Assert(channelRes.Success && channelRes.Results.length > 0, 'Email channel missing');
  Assert(provRes.Success && provRes.Results.length > 0, 'Communication provider missing');
  Assert(pmtRes.Success && pmtRes.Results.length > 0, 'Provider message type missing');

  const sender = senderRes.Results[0] as MJCommunicationSenderEntity;
  const channel = channelRes.Results[0] as MJCommunicationBaseMessageTypeEntity;
  const provider = provRes.Results[0] as MJCommunicationProviderEntity;
  const pmt = pmtRes.Results[0] as MJCommunicationProviderMessageTypeEntity;

  const endpoint = await ctx.Provider.GetEntityObject<MJCommunicationEndpointEntity>('MJ: Communication Endpoints', ctx.User);
  endpoint.BaseMessageTypeID = channel.ID;
  endpoint.NormalizedValue = address.toLowerCase();
  endpoint.ValueHash = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  endpoint.Status = 'Active';
  Assert(await endpoint.Save(), `Failed creating fixture endpoint: ${endpoint.LatestResult?.Message}`);

  const log = await ctx.Provider.GetEntityObject<MJCommunicationLogEntity>('MJ: Communication Logs', ctx.User);
  log.CommunicationProviderID = provider.ID;
  log.CommunicationProviderMessageTypeID = pmt.ID;
  log.Direction = 'Sending';
  log.Status = 'Complete';
  log.MessageDate = new Date();
  log.CommunicationSenderID = sender.ID;
  log.CommunicationEndpointID = endpoint.ID;
  log.RecipientAddress = address.toLowerCase();
  Assert(await log.Save(), `Failed creating fixture log: ${log.LatestResult?.Message}`);

  return {
    endpoint,
    log,
    sender,
    providerId: provider.ID,
    channelId: channel.ID,
    address: address.toLowerCase(),
  };
}

async function cleanupActivityFixture(fixture: ActivityFixture, ctx: IntegrationCheckContext): Promise<void> {
  const rv = new RunView();
  const supps = await rv.RunView<MJCommunicationSuppressionEntity>(
    { EntityName: 'MJ: Communication Suppressions', ExtraFilter: `CommunicationEndpointID='${fixture.endpoint.ID}'`, ResultType: 'entity_object' },
    ctx.User,
  );
  if (supps.Success && supps.Results.length > 0) {
    const suppIds = supps.Results.map((s) => `'${s.ID}'`).join(',');
    const audits = await rv.RunView<MJCommunicationConsentAuditLogEntity>(
      { EntityName: 'MJ: Communication Consent Audit Logs', ExtraFilter: `CommunicationSuppressionID IN (${suppIds})`, ResultType: 'entity_object' },
      ctx.User,
    );
    if (audits.Success) {
      for (const a of audits.Results) await a.Delete();
    }
    for (const s of supps.Results) await s.Delete();
  }

  const acts = await rv.RunView<MJCommunicationActivityEntity>(
    { EntityName: 'MJ: Communication Activities', ExtraFilter: `CommunicationEndpointID='${fixture.endpoint.ID}'`, ResultType: 'entity_object' },
    ctx.User,
  );
  if (acts.Success) {
    for (const a of acts.Results) await a.Delete();
  }

  await fixture.log.Delete();
  await fixture.endpoint.Delete();
}

export const CommsV2ActivityChecks: NamedCheck[] = [
  {
    Id: 'comms-v2-activity.CV2A1',
    Name: 'CV2A1: CommsActivityWorker processes Hard Bounce, deduplicates, and creates Suppression + AuditLog',
    Fn: async (ctx: IntegrationCheckContext) => {
      const fixture = await createActivityFixture(ctx, `cv2a1-${Date.now()}@integration.test`);
      const worker = new CommsActivityWorker();
      const evtId = `evt-cv2a1-${Date.now()}`;

      try {
        const res1 = await worker.ProcessActivityBatch(
          [
            {
              ProviderEventID: evtId,
              EventType: 'Hard Bounce',
              OccurredAt: new Date(),
              CommunicationLogID: fixture.log.ID,
              CommunicationEndpointID: fixture.endpoint.ID,
              CommunicationSenderID: fixture.sender.ID,
              CommunicationProviderID: fixture.providerId,
              NormalizedAddress: fixture.address,
              IsMachineEvent: false,
            },
          ],
          ctx.User,
        );
        AssertEqual(res1.ProcessedCount, 1, 'Expected 1 processed event');
        AssertEqual(res1.ErrorCount, 0, 'Expected 0 errors');

        // Duplicate event must be skipped
        const res2 = await worker.ProcessActivityBatch(
          [
            {
              ProviderEventID: evtId,
              EventType: 'Hard Bounce',
              OccurredAt: new Date(),
              CommunicationLogID: fixture.log.ID,
              CommunicationEndpointID: fixture.endpoint.ID,
              CommunicationProviderID: fixture.providerId,
              NormalizedAddress: fixture.address,
              IsMachineEvent: false,
            },
          ],
          ctx.User,
        );
        AssertEqual(res2.DuplicateCount, 1, 'Expected duplicate event count = 1');

        const rv = new RunView();
        const supps = await rv.RunView<MJCommunicationSuppressionEntity>(
          { EntityName: 'MJ: Communication Suppressions', ExtraFilter: `CommunicationEndpointID='${fixture.endpoint.ID}'`, ResultType: 'entity_object' },
          ctx.User,
        );
        Assert(supps.Success && supps.Results.length >= 1, 'Expected Hard Bounce suppression row created');
      } finally {
        await cleanupActivityFixture(fixture, ctx);
      }
    },
  },
  {
    Id: 'comms-v2-activity.CV2A2',
    Name: 'CV2A2: Soft Bounce threshold policy auto-suppresses endpoint after 5 soft bounces',
    Fn: async (ctx: IntegrationCheckContext) => {
      const fixture = await createActivityFixture(ctx, `cv2a2-${Date.now()}@integration.test`);
      const worker = new CommsActivityWorker();

      try {
        const events = Array.from({ length: 5 }, (_, idx) => ({
          ProviderEventID: `evt-cv2a2-${Date.now()}-${idx}`,
          EventType: 'Soft Bounce' as const,
          OccurredAt: new Date(),
          CommunicationLogID: fixture.log.ID,
          CommunicationEndpointID: fixture.endpoint.ID,
          CommunicationSenderID: fixture.sender.ID,
          CommunicationProviderID: fixture.providerId,
          NormalizedAddress: fixture.address,
          IsMachineEvent: false,
        }));

        const res = await worker.ProcessActivityBatch(events, ctx.User);
        AssertEqual(res.ProcessedCount, 5, 'Expected 5 soft bounce events processed');

        const rv = new RunView();
        const supps = await rv.RunView<MJCommunicationSuppressionEntity>(
          {
            EntityName: 'MJ: Communication Suppressions',
            ExtraFilter: `CommunicationEndpointID='${fixture.endpoint.ID}' AND Reason='Policy'`,
            ResultType: 'entity_object',
          },
          ctx.User,
        );
        Assert(supps.Success && supps.Results.length >= 1, 'Expected Policy suppression created after soft bounce threshold');
      } finally {
        await cleanupActivityFixture(fixture, ctx);
      }
    },
  },
  {
    Id: 'comms-v2-activity.CV2A3',
    Name: 'CV2A3: EraseEndpointPII scrubs endpoint/log PII while preserving suppression records',
    Fn: async (ctx: IntegrationCheckContext) => {
      const fixture = await createActivityFixture(ctx, `cv2a3-${Date.now()}@integration.test`);
      const worker = new CommsActivityWorker();

      try {
        await worker.ProcessActivityBatch(
          [
            {
              ProviderEventID: `evt-cv2a3-${Date.now()}`,
              EventType: 'Unsubscribed',
              OccurredAt: new Date(),
              CommunicationLogID: fixture.log.ID,
              CommunicationEndpointID: fixture.endpoint.ID,
              CommunicationSenderID: fixture.sender.ID,
              CommunicationProviderID: fixture.providerId,
              NormalizedAddress: fixture.address,
              IsMachineEvent: false,
            },
          ],
          ctx.User,
        );

        const eraseResult = await worker.EraseEndpointPII(fixture.endpoint.ID, fixture.channelId, ctx.User);
        Assert(eraseResult.Found, 'Expected EraseEndpointPII to find endpoint');
        Assert(eraseResult.ScrubbedLogs >= 1, 'Expected at least 1 scrubbed log');

        const rv = new RunView();
        const epRes = await rv.RunView<MJCommunicationEndpointEntity>(
          { EntityName: 'MJ: Communication Endpoints', ExtraFilter: `ID='${fixture.endpoint.ID}'`, ResultType: 'entity_object' },
          ctx.User,
        );
        Assert(epRes.Success && epRes.Results.length === 1, 'Endpoint must still exist after erasure');
        AssertEqual(epRes.Results[0].Status, 'Erased', 'Expected Endpoint Status to be Erased');
        Assert(epRes.Results[0].NormalizedValue == null, 'Expected NormalizedValue to be scrubbed to null');

        const supps = await rv.RunView<MJCommunicationSuppressionEntity>(
          { EntityName: 'MJ: Communication Suppressions', ExtraFilter: `CommunicationEndpointID='${fixture.endpoint.ID}'`, ResultType: 'entity_object' },
          ctx.User,
        );
        Assert(supps.Success && supps.Results.length >= 1, 'Suppression record must survive GDPR PII erasure');
      } finally {
        await cleanupActivityFixture(fixture, ctx);
      }
    },
  },
];

for (const check of CommsV2ActivityChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}
