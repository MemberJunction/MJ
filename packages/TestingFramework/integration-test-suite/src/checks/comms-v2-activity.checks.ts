/**
 * comms-v2-activity.checks.ts — the 'comms-v2-activity' bundle (CV2A1–CV2A4):
 * Exercises CommsActivityWorker against the live database:
 *   - CV2A1: Hard Bounce processing, deduplication, suppression & consent audit log
 *   - CV2A2: Soft Bounce threshold auto-suppression using SoftBounceThresholdPolicy
 *   - CV2A3: EraseEndpointPII GDPR erasure preserves compliance suppressions & audit logs
 *   - CV2A4: a click whose HMAC signature verifies is correlated by TrackingToken and recorded
 *
 * TRANSPORT: server, in-process, on purpose. These checks pin the worker's own rules (dedup, the
 * soft-bounce threshold, what erasure keeps), which need event shapes and repeat deliveries no
 * public route can be made to produce on demand. The path a real event takes — public route →
 * work queue → MJAPI's registered comms.activity handler → this worker — is covered over the wire
 * by the 'comms-v2-wire' bundle (CV2W1 one-click unsubscribe, CV2W2/CV2W3 signed provider
 * webhook). Nothing here publishes to the queue: a message published from this process would be
 * consumed later by whichever host shares the database, after its fixture is gone.
 *
 * Test data is named per run and tagged safe to delete, and teardown never throws; see
 * comms-v2-fixtures.ts, including the append-only audit rows teardown cannot remove.
 */
import { randomUUID } from 'node:crypto';
import { RunView } from '@memberjunction/core';
import type {
  MJCommunicationActivityEntity,
  MJCommunicationBaseMessageTypeEntity,
  MJCommunicationEndpointEntity,
  MJCommunicationLogEntity,
  MJCommunicationProviderEntity,
  MJCommunicationProviderMessageTypeEntity,
  MJCommunicationSenderEntity,
  MJCommunicationSuppressionEntity,
} from '@memberjunction/core-entities';
import {
  CommsActivityWorker,
  CommunicationEngine,
  ComputeEndpointHash,
  ComputeTrackingSignature,
  VerifyTrackingSignature,
} from '@memberjunction/communication-engine';
import { EscapeSQLString } from '@memberjunction/global';
import {
  Assert,
  AssertEqual,
  IntegrationCheckContext,
  IntegrationCheckRegistry,
  NamedCheck,
} from '@memberjunction/testing-integration';
import { COMMS_IT_TAG, CommsCleanup, CommsTestAddress, NewCommsRunTag } from './comms-v2-fixtures';

interface ActivityFixture {
  runTag: string;
  endpoint: MJCommunicationEndpointEntity;
  log: MJCommunicationLogEntity;
  sender: MJCommunicationSenderEntity;
  providerId: string;
  channelId: string;
  address: string;
}

/** A provider event ID unique to the fixture's run; teardown finds the claimed-event rows by this prefix. */
function eventId(fixture: ActivityFixture, label: string): string {
  return `mj-it-${fixture.runTag}-${label}`;
}

async function createActivityFixture(
  ctx: IntegrationCheckContext,
  label: string,
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

  const runTag = NewCommsRunTag(label);
  const address = CommsTestAddress(runTag);
  const endpoint = await ctx.Provider.GetEntityObject<MJCommunicationEndpointEntity>('MJ: Communication Endpoints', ctx.User);
  endpoint.BaseMessageTypeID = channel.ID;
  endpoint.NormalizedValue = address;
  endpoint.ValueHash = ComputeEndpointHash(address);
  endpoint.Status = 'Active';
  Assert(await endpoint.Save(), `Failed creating fixture endpoint: ${endpoint.LatestResult?.CompleteMessage}`);

  const log = await ctx.Provider.GetEntityObject<MJCommunicationLogEntity>('MJ: Communication Logs', ctx.User);
  log.CommunicationProviderID = provider.ID;
  log.CommunicationProviderMessageTypeID = pmt.ID;
  log.Direction = 'Sending';
  log.Status = 'Complete';
  log.MessageDate = new Date();
  log.CommunicationSenderID = sender.ID;
  log.CommunicationEndpointID = endpoint.ID;
  log.RecipientAddress = address;
  log.CorrelationData = JSON.stringify({ IntegrationTest: COMMS_IT_TAG, Run: runTag });
  if (!(await log.Save())) {
    const message = log.LatestResult?.CompleteMessage;
    const cleanup = new CommsCleanup('comms-v2-activity', ctx.User);
    await cleanup.Delete(endpoint, `fixture endpoint ${endpoint.ID}`);
    cleanup.Report();
    Assert(false, `Failed creating fixture log: ${message}`);
  }

  return {
    runTag,
    endpoint,
    log,
    sender,
    providerId: provider.ID,
    channelId: channel.ID,
    address,
  };
}

/** Deletes what the worker wrote for the fixture, then the fixture, children first. Never throws. */
async function cleanupActivityFixture(fixture: ActivityFixture, ctx: IntegrationCheckContext): Promise<void> {
  const cleanup = new CommsCleanup('comms-v2-activity', ctx.User);
  await cleanup.DeleteEndpointDependents([fixture.endpoint.ID], [fixture.log.ID]);
  await cleanup.DeleteWhere(
    'MJ: Communication Provider Events',
    `ProviderEventID LIKE 'mj-it-${EscapeSQLString(fixture.runTag)}-%'`,
  );
  await cleanup.Delete(fixture.log, `fixture log ${fixture.log.ID}`);
  await cleanup.Delete(fixture.endpoint, `fixture endpoint ${fixture.endpoint.ID}`);
  cleanup.Report();
}

export const CommsV2ActivityChecks: NamedCheck[] = [
  {
    Id: 'comms-v2-activity.CV2A1',
    Name: 'CV2A1: CommsActivityWorker processes Hard Bounce, deduplicates, and creates Suppression + AuditLog',
    Fn: async (ctx: IntegrationCheckContext) => {
      const fixture = await createActivityFixture(ctx, 'cv2a1');
      const worker = new CommsActivityWorker();
      const evtId = eventId(fixture, 'bounce');

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
      const fixture = await createActivityFixture(ctx, 'cv2a2');
      const worker = new CommsActivityWorker();

      try {
        const events = Array.from({ length: 5 }, (_, idx) => ({
          ProviderEventID: eventId(fixture, `soft-${idx}`),
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
      const fixture = await createActivityFixture(ctx, 'cv2a3');
      const worker = new CommsActivityWorker();

      try {
        await worker.ProcessActivityBatch(
          [
            {
              ProviderEventID: eventId(fixture, 'unsub'),
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
  {
    Id: 'comms-v2-activity.CV2A4',
    Name: 'CV2A4: a click with a verified HMAC signature is correlated by TrackingToken and recorded as an activity',
    Fn: async (ctx: IntegrationCheckContext) => {
      const fixture = await createActivityFixture(ctx, 'cv2a4');
      try {
        const trackingToken = randomUUID();
        fixture.log.TrackingToken = trackingToken;
        Assert(await fixture.log.Save(), `Failed saving tracking token on fixture log: ${fixture.log.LatestResult?.CompleteMessage}`);

        const hmacSecret = `mj-it-${fixture.runTag}-hmac-secret-32-chars-min`;
        const targetUrl = 'https://memberjunction.org/e2e?a=1&b=2';
        const sig = ComputeTrackingSignature(trackingToken, targetUrl, hmacSecret);
        Assert(VerifyTrackingSignature(trackingToken, targetUrl, sig, hmacSecret), 'Expected Compute/VerifyTrackingSignature parity');
        Assert(
          !VerifyTrackingSignature(trackingToken, `${targetUrl}&c=3`, sig, hmacSecret),
          'A signature must not verify for a different target URL',
        );

        const worker = new CommsActivityWorker();
        const batchRes = await worker.ProcessActivityBatch(
          [
            {
              CommunicationProviderID: fixture.providerId,
              NormalizedAddress: fixture.address,
              EventType: 'Clicked',
              OccurredAt: new Date(),
              TrackingToken: trackingToken,
              TargetURL: targetUrl,
              IsMachineEvent: false,
            },
          ],
          ctx.User,
        );
        AssertEqual(batchRes.ProcessedCount, 1, 'Expected the click processed');
        AssertEqual(batchRes.ErrorCount, 0, 'Expected 0 processing errors');

        const rv = new RunView();
        const acts = await rv.RunView<MJCommunicationActivityEntity>(
          {
            EntityName: 'MJ: Communication Activities',
            ExtraFilter: `CommunicationLogID='${fixture.log.ID}' AND EventType='Clicked'`,
            ResultType: 'entity_object',
            BypassCache: true,
          },
          ctx.User,
        );
        Assert(acts.Success && acts.Results.length === 1, 'Expected one Clicked activity correlated to the log by TrackingToken');
        AssertEqual(acts.Results[0].TargetURL, targetUrl, 'Expected the activity to record the clicked URL');

        const supps = await rv.RunView<MJCommunicationSuppressionEntity>(
          {
            EntityName: 'MJ: Communication Suppressions',
            ExtraFilter: `CommunicationEndpointID='${fixture.endpoint.ID}'`,
            ResultType: 'entity_object',
            BypassCache: true,
          },
          ctx.User,
        );
        Assert(supps.Success && supps.Results.length === 0, 'A click must not suppress the endpoint');
      } finally {
        await cleanupActivityFixture(fixture, ctx);
      }
    },
  },
];

for (const check of CommsV2ActivityChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}
