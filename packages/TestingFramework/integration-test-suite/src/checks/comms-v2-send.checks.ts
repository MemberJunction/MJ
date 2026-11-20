/**
 * comms-v2-send.checks.ts — the 'comms-v2-send' bundle (CV2S1–CV2S3):
 * Exercises V2SendService.Send() (DryRun, link rewriting, open pixel, List-Unsubscribe headers,
 * chunked WorkQueue dispatch) and TemplatedCommunicationService.RenderAndSend() end-to-end
 * against live SQL Server.
 */
import { RunView } from '@memberjunction/core';
import type {
  MJCommunicationBaseMessageTypeEntity,
  MJCommunicationEndpointEntity,
  MJCommunicationLogEntity,
  MJCommunicationProviderEntity,
  MJCommunicationRunEntity,
  MJCommunicationSenderEntity,
  MJTemplateContentEntity,
  MJTemplateEntityExtended,
  MJTemplateParamEntity,
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

async function cleanupRunAndLogs(runId: string | undefined, ctx: IntegrationCheckContext): Promise<void> {
  if (!runId) return;
  const rv = new RunView();
  const logs = await rv.RunView<MJCommunicationLogEntity>(
    { EntityName: 'MJ: Communication Logs', ExtraFilter: `CommunicationRunID='${runId}'`, ResultType: 'entity_object' },
    ctx.User,
  );
  if (logs.Success) {
    for (const log of logs.Results) {
      await log.Delete();
    }
  }
  const runs = await rv.RunView<MJCommunicationRunEntity>(
    { EntityName: 'MJ: Communication Runs', ExtraFilter: `ID='${runId}'`, ResultType: 'entity_object' },
    ctx.User,
  );
  if (runs.Success) {
    for (const run of runs.Results) {
      await run.Delete();
    }
  }
}

export const CommsV2SendChecks: NamedCheck[] = [
  {
    Id: 'comms-v2-send.CV2S1',
    Name: 'CV2S1: V2SendService.Send DryRun persists CommunicationRun/Log with tracking tokens',
    Fn: async (ctx: IntegrationCheckContext) => {
      const { sender, channel, providerId } = await loadEmailContext(ctx);
      const sendService = new V2SendService();
      const hmacSecret = 'mj-it-cv2s1-hmac-secret';
      sendService.Configure({
        BaseTrackingURL: 'https://example.test/api',
        TrackingHMACSecret: hmacSecret,
      });

      const targetUrl = 'https://memberjunction.org/docs';
      const address = `cv2s1-${Date.now()}@integration.test`;
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
              Subject: 'CV2S1 Integration Check',
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
        await cleanupRunAndLogs(runId, ctx);
        if (endpoint.IsSaved) await endpoint.Delete();
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
            Payload: { Subject: 'CV2S2 Chunked', Body: 'Chunk test' },
            Recipients: [
              {
                Principal: { EntityID: userEntityId, RecordID: ctx.User.ID },
                Endpoint: { Address: 'cv2s2-a@integration.test' },
              },
              {
                Principal: { EntityID: userEntityId, RecordID: ctx.User.ID },
                Endpoint: { Address: 'cv2s2-b@integration.test' },
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
        await cleanupRunAndLogs(runId, ctx);
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
      template.Name = `CV2S3-Template-${Date.now()}`;
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
                Endpoint: { Address: 'cv2s3@integration.test' },
              },
            ],
          },
          ctx.User,
        );

        runId = result.CommunicationRunID;
        Assert(result.Success, 'Expected TemplatedCommunicationService.RenderAndSend to succeed');
        AssertEqual(result.TotalCount, 1, 'Expected TotalCount = 1');
      } finally {
        await cleanupRunAndLogs(runId, ctx);
        if (template.IsSaved) {
          const paramRes = await rv.RunView<MJTemplateParamEntity>(
            { EntityName: 'MJ: Template Params', ExtraFilter: `TemplateID='${template.ID}'`, ResultType: 'entity_object' },
            ctx.User,
          );
          if (paramRes.Success) {
            for (const p of paramRes.Results) await p.Delete();
          }
        }
        if (content?.IsSaved) await content.Delete();
        if (template.IsSaved) await template.Delete();
      }
    },
  },
];

for (const check of CommsV2SendChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}
