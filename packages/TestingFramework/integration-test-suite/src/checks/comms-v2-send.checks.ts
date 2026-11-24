/**
 * comms-v2-send.checks.ts — the 'comms-v2-send' bundle (CV2S1–CV2S4):
 * Exercises V2SendService.Send() (DryRun, link rewriting, open pixel, List-Unsubscribe headers,
 * chunked WorkQueue dispatch, a suppressed recipient) and
 * TemplatedCommunicationService.RenderAndSend() end-to-end against the live database.
 *
 * TRANSPORT: server, in-process, on purpose. V2 Send has no wire of its own: no GraphQL mutation,
 * REST route or remote operation takes a SendToPrincipalsParams. Its only route from a client is
 * V1 RunEntityCommunicationByViewID with ContextData.UseV2, which carries no DryRun and cannot be
 * handed a test provider, so it is driven over GraphQL only for a recipient the gate must block
 * (comms-v2-wire.CV2W5). What needs a stand-in provider or an injected enqueue hook stays here:
 * CV2S1–CV2S3 pass a provider that never contacts a service, and CV2S4 counts provider calls,
 * which nothing outside the process can observe.
 *
 * Test data is named per run and tagged safe to delete, and teardown never throws; see
 * comms-v2-fixtures.ts.
 */
import { RunView } from '@memberjunction/core';
import type {
  MJCommunicationBaseMessageTypeEntity,
  MJCommunicationEndpointEntity,
  MJCommunicationLogEntity,
  MJCommunicationProviderEntity,
  MJCommunicationSenderEntity,
  MJCommunicationSuppressionEntity,
  MJTemplateContentEntity,
  MJTemplateEntityExtended,
} from '@memberjunction/core-entities';
import {
  BaseCommunicationProvider,
  MessageResult,
  ProcessedMessage,
} from '@memberjunction/communication-types';
import {
  CommunicationEngine,
  ComputeEndpointHash,
  ComputeTrackingSignature,
  V2SendService,
  VerifyTrackingSignature,
} from '@memberjunction/communication-engine';
import { TemplatedCommunicationService } from '@memberjunction/entity-communications-server';
import {
  Assert,
  AssertEqual,
  IntegrationCheckContext,
  IntegrationCheckRegistry,
  NamedCheck,
} from '@memberjunction/testing-integration';
import { COMMS_IT_TAG, CommsCleanup, CommsTestAddress, NewCommsRunTag, QuotedIdList } from './comms-v2-fixtures';

const BUNDLE = 'comms-v2-send';

class DryRunTestProvider extends BaseCommunicationProvider {
  public async SendSingleMessage(message: ProcessedMessage): Promise<MessageResult> {
    return { Success: true, Error: '', Message: message, DryRun: true };
  }
  public async GetMessages(): Promise<never> {
    throw new Error('Not implemented');
  }
  public async ForwardMessage(): Promise<never> {
    throw new Error('Not implemented');
  }
  public async ReplyToMessage(): Promise<never> {
    throw new Error('Not implemented');
  }
  public async CreateDraft(): Promise<never> {
    throw new Error('Not implemented');
  }
}

/** A provider that never contacts a service and counts how often it is asked to send. */
class CountingTestProvider extends DryRunTestProvider {
  public SendCalls = 0;
  public override async SendSingleMessage(message: ProcessedMessage): Promise<MessageResult> {
    this.SendCalls++;
    return super.SendSingleMessage(message);
  }
}

async function loadEmailContext(ctx: IntegrationCheckContext): Promise<{
  sender: MJCommunicationSenderEntity;
  channel: MJCommunicationBaseMessageTypeEntity;
  providerId: string;
  userEntityId: string;
}> {
  await CommunicationEngine.Instance.Config(false, ctx.User);
  const rv = new RunView();
  const [senderRes, channelRes, provRes] = await rv.RunViews(
    [
      { EntityName: 'MJ: Communication Senders', ExtraFilter: "Name='Default Organization'", MaxRows: 1, ResultType: 'entity_object' },
      { EntityName: 'MJ: Communication Base Message Types', ExtraFilter: "Type='Email'", MaxRows: 1, ResultType: 'entity_object' },
      { EntityName: 'MJ: Communication Providers', ExtraFilter: "Name='SendGrid'", MaxRows: 1, ResultType: 'entity_object' },
    ],
    ctx.User,
  );
  Assert(senderRes.Success && senderRes.Results.length > 0, 'Default Organization sender not found');
  Assert(channelRes.Success && channelRes.Results.length > 0, 'Email base message type not found');
  Assert(provRes.Success && provRes.Results.length > 0, 'SendGrid provider not found');
  const userEntity = ctx.Provider.Entities.find((e) => e.Name === 'MJ: Users');
  Assert(userEntity != null, 'MJ: Users entity not found');

  return {
    sender: senderRes.Results[0] as MJCommunicationSenderEntity,
    channel: channelRes.Results[0] as MJCommunicationBaseMessageTypeEntity,
    providerId: (provRes.Results[0] as MJCommunicationProviderEntity).ID,
    userEntityId: userEntity!.ID,
  };
}

/** Queues the deletion of a run and its logs (logs first). Never throws. */
async function cleanupRunAndLogs(cleanup: CommsCleanup, runId: string | undefined): Promise<void> {
  if (!runId) return;
  await cleanup.DeleteWhere('MJ: Communication Logs', `CommunicationRunID='${runId}'`);
  await cleanup.DeleteWhere('MJ: Communication Runs', `ID='${runId}'`);
}

/** Deletes the endpoints Send resolved for the given addresses, with whatever hangs off them. Never throws. */
async function cleanupEndpointsByAddress(cleanup: CommsCleanup, addresses: readonly string[]): Promise<void> {
  const hashes = addresses.map((a) => ComputeEndpointHash(a.toLowerCase()));
  await cleanup.Step('endpoints resolved by Send', async () => {
    const res = await new RunView().RunView<{ ID: string }>(
      { EntityName: 'MJ: Communication Endpoints', Fields: ['ID'], ExtraFilter: `ValueHash IN (${QuotedIdList(hashes)})`, ResultType: 'simple', BypassCache: true },
      cleanup.User,
    );
    if (!res.Success || res.Results.length === 0) return;
    const ids = res.Results.map((r) => r.ID);
    await cleanup.DeleteEndpointDependents(ids);
    await cleanup.DeleteWhere('MJ: Communication Endpoints', `ID IN (${QuotedIdList(ids)})`);
  });
}

export const CommsV2SendChecks: NamedCheck[] = [
  {
    Id: 'comms-v2-send.CV2S1',
    Name: 'CV2S1: V2SendService.Send DryRun persists CommunicationRun/Log with tracking tokens',
    Fn: async (ctx: IntegrationCheckContext) => {
      const { sender, channel, providerId } = await loadEmailContext(ctx);
      const sendService = new V2SendService();
      const runTag = NewCommsRunTag('cv2s1');
      const hmacSecret = `mj-it-${runTag}-hmac-secret`;
      sendService.Configure({
        BaseTrackingURL: 'https://example.test/api',
        TrackingHMACSecret: hmacSecret,
      });

      const targetUrl = 'https://memberjunction.org/docs';
      const address = CommsTestAddress(runTag);
      const endpoint = await ctx.Provider.GetEntityObject<MJCommunicationEndpointEntity>(
        'MJ: Communication Endpoints',
        ctx.User,
      );
      endpoint.BaseMessageTypeID = channel.ID;
      endpoint.NormalizedValue = address;
      endpoint.ValueHash = ComputeEndpointHash(address);
      endpoint.Status = 'Active';

      let runId: string | undefined;

      try {
        Assert(await endpoint.Save(), `Failed saving endpoint: ${endpoint.LatestResult?.Message}`);

        const result = await sendService.Send(
          {
            Envelope: {
              SenderID: sender.ID,
              ProviderID: providerId,
              MessageClass: 'Operational',
              ChannelID: channel.ID,
              TrackOpens: true,
              TrackClicks: true,
              DryRun: true,
            },
            Payload: {
              Subject: `CV2S1 ${runTag} ${COMMS_IT_TAG}`,
              Body: 'Plain text body',
              HTMLBody: `<p>Hello <a href="${targetUrl}">Docs</a></p>`,
            },
            Recipients: [
              {
                Endpoint: { CommunicationEndpointID: endpoint.ID },
              },
            ],
          },
          ctx.User,
          () => new DryRunTestProvider(),
        );

        runId = result.CommunicationRunID;
        Assert(result.Success, `Expected V2SendService.Send DryRun to succeed: ${result.ErrorMessage ?? ''}`);
        AssertEqual(result.TotalCount, 1, 'Expected TotalCount = 1');
        const outcomes = result.Outcomes ?? [];
        Assert(outcomes.length === 1, 'Expected 1 recipient outcome');
        const logId = outcomes[0].CommunicationLogID;
        Assert(
          logId != null,
          `Expected CommunicationLogID on outcome (status=${outcomes[0].Status}, reason=${outcomes[0].Reason ?? ''}, detail=${outcomes[0].Detail ?? ''})`,
        );

        const rv = new RunView();
        const logRes = await rv.RunView<MJCommunicationLogEntity>(
          { EntityName: 'MJ: Communication Logs', ExtraFilter: `ID='${logId}'`, MaxRows: 1, ResultType: 'entity_object' },
          ctx.User,
        );
        Assert(logRes.Success && logRes.Results.length === 1, 'CommunicationLog row not persisted');
        const log = logRes.Results[0];
        Assert(log.TrackingToken != null && log.TrackingToken.length > 0, 'Expected TrackingToken on log');
        Assert(log.UnsubscribeToken != null && log.UnsubscribeToken.length > 0, 'Expected UnsubscribeToken on log');
        Assert(log.ComplianceDecision != null && log.ComplianceDecision.length > 0, 'Expected ComplianceDecision JSON on log');
        const parsedDecision = JSON.parse(log.ComplianceDecision!) as { Decision?: string };
        AssertEqual(parsedDecision.Decision, 'Allowed', 'Expected ComplianceDecision.Decision = Allowed');

        const v1Allowed = await sendService.CheckV1ComplianceGate(channel.ID, address, 'Transactional', ctx.User);
        Assert(v1Allowed.Allowed, 'Expected V1 gate to allow Active endpoint');
        endpoint.Status = 'Hard Bounced';
        Assert(await endpoint.Save(), 'Failed updating endpoint to Hard Bounced');
        const v1Blocked = await sendService.CheckV1ComplianceGate(channel.ID, address, 'Transactional', ctx.User);
        Assert(!v1Blocked.Allowed, 'Expected V1 gate to block Hard Bounced endpoint');

        const sig = ComputeTrackingSignature(log.TrackingToken!, targetUrl, hmacSecret);
        Assert(VerifyTrackingSignature(log.TrackingToken!, targetUrl, sig, hmacSecret), 'HMAC signature verification failed');
      } finally {
        const cleanup = new CommsCleanup(BUNDLE, ctx.User);
        await cleanupRunAndLogs(cleanup, runId);
        await cleanup.DeleteEndpointDependents(endpoint.IsSaved ? [endpoint.ID] : []);
        await cleanup.Delete(endpoint, 'CV2S1 fixture endpoint');
        cleanup.Report();
      }
    },
  },
  {
    Id: 'comms-v2-send.CV2S2',
    Name: 'CV2S2: V2SendService.Send dispatches comms.dispatch chunk when exceeding AsyncThreshold',
    Fn: async (ctx: IntegrationCheckContext) => {
      const { sender, channel, userEntityId } = await loadEmailContext(ctx);
      const enqueued: Array<{ taskType: string; payload: Record<string, unknown> }> = [];

      const sendService = new V2SendService();
      sendService.Configure({
        ChunkSize: 1,
        AsyncThreshold: 1,
        EnqueueWork: async (taskType, payload) => {
          enqueued.push({ taskType, payload });
        },
      });

      const runTag = NewCommsRunTag('cv2s2');
      const addresses = [CommsTestAddress(runTag, 'a'), CommsTestAddress(runTag, 'b')];
      let runId: string | undefined;
      try {
        const result = await sendService.Send(
          {
            Envelope: {
              SenderID: sender.ID,
              MessageClass: 'Operational',
              ChannelID: channel.ID,
              DryRun: true,
            },
            Payload: { Subject: `CV2S2 ${runTag} ${COMMS_IT_TAG}`, Body: 'Chunk test' },
            Recipients: [
              {
                Principal: { EntityID: userEntityId, RecordID: ctx.User.ID },
                Endpoint: { Address: addresses[0] },
              },
              {
                Principal: { EntityID: userEntityId, RecordID: ctx.User.ID },
                Endpoint: { Address: addresses[1] },
              },
            ],
          },
          ctx.User,
          (name) => CommunicationEngine.Instance.GetProvider(name)!,
        );

        runId = result.CommunicationRunID;
        Assert(result.Success, 'Expected chunked Send to succeed');
        AssertEqual(result.IsAsyncRun, true, 'Expected IsAsyncRun = true');
        AssertEqual(result.QueuedCount, 2, 'Expected QueuedCount = 2');
        Assert(enqueued.length >= 2, `Expected >= 2 comms.dispatch chunks, got ${enqueued.length}`);
        AssertEqual(enqueued[0].taskType, 'comms.dispatch', 'Expected comms.dispatch task type');
      } finally {
        const cleanup = new CommsCleanup(BUNDLE, ctx.User);
        await cleanupRunAndLogs(cleanup, runId);
        await cleanupEndpointsByAddress(cleanup, addresses);
        cleanup.Report();
      }
    },
  },
  {
    Id: 'comms-v2-send.CV2S3',
    Name: 'CV2S3: TemplatedCommunicationService.RenderAndSend renders live templates and sends DryRun',
    Fn: async (ctx: IntegrationCheckContext) => {
      const { sender, channel, userEntityId } = await loadEmailContext(ctx);
      const rv = new RunView();
      const contentTypeRes = await rv.RunView<{ ID: string }>(
        { EntityName: 'MJ: Template Content Types', ExtraFilter: "Name='HTML'", MaxRows: 1, ResultType: 'simple' },
        ctx.User,
      );
      Assert(contentTypeRes.Success && contentTypeRes.Results.length > 0, 'HTML template content type not found');
      const htmlTypeId = contentTypeRes.Results[0].ID;

      const template = await ctx.Provider.GetEntityObject<MJTemplateEntityExtended>('MJ: Templates', ctx.User);
      const runTag = NewCommsRunTag('cv2s3');
      const address = CommsTestAddress(runTag);
      template.Name = `CV2S3 ${runTag} ${COMMS_IT_TAG}`;
      template.Description = `Comms V2 send fixture ${COMMS_IT_TAG}`;
      template.UserID = ctx.User.ID;
      template.IsActive = true;

      let content: MJTemplateContentEntity | null = null;
      let runId: string | undefined;

      try {
        Assert(await template.Save(), `Failed saving template: ${template.LatestResult?.Message}`);
        content = await ctx.Provider.GetEntityObject<MJTemplateContentEntity>('MJ: Template Contents', ctx.User);
        content.TemplateID = template.ID;
        content.TypeID = htmlTypeId;
        content.TemplateText = '<p>Hi {{ Name }}</p>';
        content.Priority = 1;
        content.IsActive = true;
        Assert(await content.Save(), `Failed saving template content: ${content.LatestResult?.Message}`);

        const result = await TemplatedCommunicationService.Instance.RenderAndSend(
          {
            Envelope: {
              SenderID: sender.ID,
              MessageClass: 'Operational',
              ChannelID: channel.ID,
              DryRun: true,
            },
            Templates: {
              HTMLBodyTemplateID: template.ID,
              SharedContextData: { Name: 'Comms V2 Tester' },
            },
            Recipients: [
              {
                Principal: { EntityID: userEntityId, RecordID: ctx.User.ID },
                Endpoint: { Address: address },
              },
            ],
          },
          ctx.User,
        );

        runId = result.CommunicationRunID;
        Assert(result.Success, `Expected TemplatedCommunicationService.RenderAndSend to succeed: ${result.ErrorMessage ?? 'no error message'}`);
        AssertEqual(result.TotalCount, 1, 'Expected TotalCount = 1');
      } finally {
        const cleanup = new CommsCleanup(BUNDLE, ctx.User);
        await cleanupRunAndLogs(cleanup, runId);
        await cleanupEndpointsByAddress(cleanup, [address]);
        if (template.IsSaved) {
          await cleanup.DeleteWhere('MJ: Template Params', `TemplateID='${template.ID}'`);
        }
        await cleanup.Delete(content, 'CV2S3 template content');
        await cleanup.Delete(template, 'CV2S3 template');
        cleanup.Report();
      }
    },
  },
  {
    Id: 'comms-v2-send.CV2S4',
    Name: 'CV2S4: V2SendService.Send blocks a recipient with an active suppression and never calls the provider',
    // In-process by necessity: "the provider was not called" is only observable from inside the
    // process that owns the provider. The same block is asserted over GraphQL by comms-v2-wire.CV2W5.
    Fn: async (ctx: IntegrationCheckContext) => {
      const { sender, channel, providerId } = await loadEmailContext(ctx);
      const runTag = NewCommsRunTag('cv2s4');
      const address = CommsTestAddress(runTag);
      const provider = new CountingTestProvider();
      const sendService = new V2SendService();

      const endpoint = await ctx.Provider.GetEntityObject<MJCommunicationEndpointEntity>('MJ: Communication Endpoints', ctx.User);
      endpoint.BaseMessageTypeID = channel.ID;
      endpoint.NormalizedValue = address;
      endpoint.ValueHash = ComputeEndpointHash(address);
      endpoint.Status = 'Active';
      const suppression = await ctx.Provider.GetEntityObject<MJCommunicationSuppressionEntity>('MJ: Communication Suppressions', ctx.User);
      let runId: string | undefined;

      try {
        Assert(await endpoint.Save(), `Failed saving endpoint: ${endpoint.LatestResult?.CompleteMessage}`);
        suppression.CommunicationEndpointID = endpoint.ID;
        suppression.BaseMessageTypeID = channel.ID;
        suppression.Reason = 'Hard Bounce';
        suppression.Source = 'Admin';
        suppression.Status = 'Active';
        suppression.EffectiveAt = new Date(Date.now() - 60_000);
        suppression.Notes = `${COMMS_IT_TAG} run ${runTag}`;
        Assert(await suppression.Save(), `Failed saving suppression: ${suppression.LatestResult?.CompleteMessage}`);

        const result = await sendService.Send(
          {
            Envelope: {
              SenderID: sender.ID,
              ProviderID: providerId,
              MessageClass: 'Operational',
              ChannelID: channel.ID,
              DryRun: true,
            },
            Payload: { Subject: `CV2S4 ${runTag} ${COMMS_IT_TAG}`, Body: 'Suppressed recipient' },
            Recipients: [{ Endpoint: { CommunicationEndpointID: endpoint.ID } }],
          },
          ctx.User,
          () => provider,
        );

        runId = result.CommunicationRunID;
        AssertEqual(result.TotalCount, 1, 'Expected TotalCount = 1');
        AssertEqual(result.BlockedCount, 1, `Expected the recipient blocked: ${result.ErrorMessage ?? ''}`);
        AssertEqual(result.QueuedCount, 0, 'Expected nothing queued for a blocked recipient');
        const outcomes = result.Outcomes ?? [];
        AssertEqual(outcomes.length, 1, 'Expected 1 recipient outcome');
        AssertEqual(outcomes[0].Status, 'Blocked', 'Expected outcome Status = Blocked');
        AssertEqual(outcomes[0].Reason, 'Hard Bounce', 'Expected the block reason to be the suppression reason');
        Assert(outcomes[0].CommunicationLogID == null, 'A blocked recipient must not get a Communication Log');
        AssertEqual(provider.SendCalls, 0, 'The provider must not be called for a blocked recipient');

        const logs = await new RunView().RunView<{ ID: string }>(
          {
            EntityName: 'MJ: Communication Logs',
            Fields: ['ID'],
            ExtraFilter: `CommunicationEndpointID='${endpoint.ID}'`,
            ResultType: 'simple',
            BypassCache: true,
          },
          ctx.User,
        );
        Assert(logs.Success && logs.Results.length === 0, 'No Communication Log may exist for the blocked endpoint');
      } finally {
        const cleanup = new CommsCleanup(BUNDLE, ctx.User);
        await cleanupRunAndLogs(cleanup, runId);
        await cleanup.Delete(suppression, 'CV2S4 fixture suppression');
        await cleanup.DeleteEndpointDependents(endpoint.IsSaved ? [endpoint.ID] : []);
        await cleanup.Delete(endpoint, 'CV2S4 fixture endpoint');
        cleanup.Report();
      }
    },
  },
];

for (const check of CommsV2SendChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}
