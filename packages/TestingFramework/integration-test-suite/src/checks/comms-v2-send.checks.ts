/**
 * comms-v2-send.checks.ts — the 'comms-v2-send' bundle (CV2S1–CV2S7):
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
 * CV2S5–CV2S7 prove guarantees the database enforces, so they need real SQL Server: a chunked run
 * ends exactly once through MJ: Communication Run Chunks, a stuck log is resent only under the
 * At Least Once delivery guarantee (the claim's DATEADD SQL), one active Admin Block per address
 * (a filtered unique index), and an append-only consent audit log (a trigger).
 *
 * Test data is named per run and tagged safe to delete, and teardown never throws; see
 * comms-v2-fixtures.ts.
 */
import { RunView } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import type {
  MJCommunicationBaseMessageTypeEntity,
  MJCommunicationConsentAuditLogEntity,
  MJCommunicationEndpointEntity,
  MJCommunicationLogEntity,
  MJCommunicationProviderEntity,
  MJCommunicationRunEntity,
  MJCommunicationSenderEntity,
  MJCommunicationSuppressionEntity,
  MJTemplateContentEntity,
  MJTemplateEntityExtended,
} from '@memberjunction/core-entities';
import {
  BaseCommunicationProvider,
  MessageResult,
  ProcessedMessage,
  SendToPrincipalsParams,
} from '@memberjunction/communication-types';
import {
  CommunicationEngine,
  ComputeEndpointHash,
  ComputeTrackingSignature,
  V2SendService,
  VerifyTrackingSignature,
} from '@memberjunction/communication-engine';
import { TemplatedCommunicationService } from '@memberjunction/entity-communications-server';
import { EscapeSQLString } from '@memberjunction/global';
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

/** Queues the deletion of a run, its logs and its chunk rows (children first). Never throws. */
async function cleanupRunAndLogs(cleanup: CommsCleanup, runId: string | undefined): Promise<void> {
  if (!runId) return;
  await cleanup.DeleteWhere('MJ: Communication Logs', `CommunicationRunID='${runId}'`);
  await cleanup.DeleteWhere('MJ: Communication Run Chunks', `CommunicationRunID='${runId}'`);
  await cleanup.DeleteWhere('MJ: Communication Runs', `ID='${runId}'`);
}

/** Reads one run fresh from the database. */
async function loadRun(runId: string, user: UserInfo): Promise<MJCommunicationRunEntity> {
  const res = await new RunView().RunView<MJCommunicationRunEntity>(
    { EntityName: 'MJ: Communication Runs', ExtraFilter: `ID='${EscapeSQLString(runId)}'`, MaxRows: 1, ResultType: 'entity_object', BypassCache: true },
    user,
  );
  Assert(res.Success && res.Results.length === 1, `Communication run ${runId} not found: ${res.ErrorMessage ?? ''}`);
  return res.Results[0];
}

/** Counts a run's chunk rows. */
async function countRunChunks(runId: string, user: UserInfo): Promise<number> {
  const res = await new RunView().RunView<{ ID: string }>(
    { EntityName: 'MJ: Communication Run Chunks', Fields: ['ID'], ExtraFilter: `CommunicationRunID='${EscapeSQLString(runId)}'`, ResultType: 'simple', BypassCache: true },
    user,
  );
  Assert(res.Success, `Failed reading run chunks: ${res.ErrorMessage ?? ''}`);
  return res.Results.length;
}

/** Reads a log's claim-relevant columns straight from the database. */
async function readLogRaw(ctx: IntegrationCheckContext, logId: string): Promise<{ Status: string; UpdatedAt: Date }> {
  const schema = ctx.Schema ?? '__mj';
  const res = await ctx.Pool!.request().query<{ Status: string; UpdatedAt: Date }>(
    `SELECT Status, __mj_UpdatedAt AS UpdatedAt FROM [${schema}].[CommunicationLog] WHERE ID = '${EscapeSQLString(logId)}'`,
  );
  Assert(res.recordset.length === 1, `Communication log ${logId} not found`);
  return res.recordset[0];
}

/** Runs `sql` expecting SQL Server to refuse it; returns the error message. */
async function expectSqlRefused(ctx: IntegrationCheckContext, sql: string, what: string): Promise<string> {
  try {
    await ctx.Pool!.request().query(sql);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error(`${what} was allowed; the database should have refused it`);
}

/** Calls Save()/Delete() and reports whether it was refused (false or thrown). */
async function isRefused(write: () => Promise<boolean>): Promise<boolean> {
  try {
    return !(await write());
  } catch {
    return true;
  }
}

/** Saves a new active, tagged Admin Block for the endpoint; returns the entity and whether it saved. */
async function trySaveAdminBlock(
  ctx: IntegrationCheckContext,
  endpoint: MJCommunicationEndpointEntity,
  runTag: string,
): Promise<{ Suppression: MJCommunicationSuppressionEntity; Saved: boolean }> {
  const supp = await ctx.Provider.GetEntityObject<MJCommunicationSuppressionEntity>('MJ: Communication Suppressions', ctx.User);
  supp.CommunicationEndpointID = endpoint.ID;
  supp.BaseMessageTypeID = endpoint.BaseMessageTypeID;
  supp.Reason = 'Admin Block';
  supp.Source = 'Admin';
  supp.Status = 'Active';
  supp.EffectiveAt = new Date();
  supp.Notes = `${COMMS_IT_TAG} run ${runTag}`;
  return { Suppression: supp, Saved: !(await isRefused(() => supp.Save())) };
}

/** Removes audit rows for the given suppressions the one sanctioned way: the erase session key, in one batch. */
async function eraseAuditRows(ctx: IntegrationCheckContext, cleanup: CommsCleanup, suppressionIds: readonly string[]): Promise<void> {
  if (suppressionIds.length === 0 || !ctx.Pool) return;
  const schema = ctx.Schema ?? '__mj';
  await cleanup.Step('consent audit rows (erase session key)', async () => {
    await ctx.Pool!.request().query(`
      EXEC sp_set_session_context @key = N'MJ.CommsAuditErase', @value = 1;
      BEGIN TRY
        DELETE FROM [${schema}].[CommunicationConsentAuditLog] WHERE CommunicationSuppressionID IN (${QuotedIdList(suppressionIds)});
      END TRY
      BEGIN CATCH
        EXEC sp_set_session_context @key = N'MJ.CommsAuditErase', @value = NULL;
        THROW;
      END CATCH;
      EXEC sp_set_session_context @key = N'MJ.CommsAuditErase', @value = NULL;`);
  });
}

/** Saves a tagged endpoint for one test address. */
async function saveTestEndpoint(
  ctx: IntegrationCheckContext,
  channelId: string,
  address: string,
): Promise<MJCommunicationEndpointEntity> {
  const endpoint = await ctx.Provider.GetEntityObject<MJCommunicationEndpointEntity>('MJ: Communication Endpoints', ctx.User);
  endpoint.BaseMessageTypeID = channelId;
  endpoint.NormalizedValue = address;
  endpoint.ValueHash = ComputeEndpointHash(address);
  endpoint.Status = 'Active';
  Assert(await endpoint.Save(), `Failed saving endpoint: ${endpoint.LatestResult?.CompleteMessage}`);
  return endpoint;
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


/** Reads a captured comms.dispatch payload's run ID and chunk position. */
function readDispatchChunk(payload: Record<string, unknown>): { RunID: string; Index: number; Count: number } {
  const runId = payload.CommunicationRunID;
  const chunk = payload.RunChunk;
  Assert(typeof runId === 'string', 'comms.dispatch payload has no CommunicationRunID');
  Assert(
    chunk != null && typeof chunk === 'object' && 'Index' in chunk && 'Count' in chunk && typeof chunk.Index === 'number' && typeof chunk.Count === 'number',
    'comms.dispatch payload has no RunChunk {Index, Count}',
  );
  return { RunID: runId as string, Index: (chunk as { Index: number }).Index, Count: (chunk as { Count: number }).Count };
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
      const { sender, channel, providerId, userEntityId } = await loadEmailContext(ctx);
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
              ProviderID: providerId,
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
        Assert(result.Success, `Expected chunked Send to succeed: ${result.ErrorMessage ?? ''}`);
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
      const { sender, channel, providerId, userEntityId } = await loadEmailContext(ctx);
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
              ProviderID: providerId,
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

  {
    Id: 'comms-v2-send.CV2S5',
    Name: 'CV2S5: a chunked run records one Communication Run Chunk per chunk and ends exactly when the last chunk finishes',
    Fn: async (ctx: IntegrationCheckContext) => {
      const { sender, channel, providerId } = await loadEmailContext(ctx);
      const captured: Array<Record<string, unknown>> = [];
      const sendService = new V2SendService();
      sendService.Configure({
        ChunkSize: 1,
        AsyncThreshold: 1,
        EnqueueWork: async (taskType, payload) => {
          if (taskType === 'comms.dispatch') captured.push(payload);
        },
      });

      const runTag = NewCommsRunTag('cv2s5');
      const addresses = [CommsTestAddress(runTag, 'a'), CommsTestAddress(runTag, 'b'), CommsTestAddress(runTag, 'c')];
      const base: Omit<SendToPrincipalsParams, 'Recipients'> = {
        Envelope: { SenderID: sender.ID, ProviderID: providerId, MessageClass: 'Operational', ChannelID: channel.ID, DryRun: true },
        Payload: { Subject: `CV2S5 ${runTag} ${COMMS_IT_TAG}`, Body: 'Chunked run' },
      };
      const recipients = addresses.map((address) => ({ Endpoint: { Address: address } }));
      const provider = () => new DryRunTestProvider();
      let runId: string | undefined;
      try {
        const queued = await sendService.Send({ ...base, Recipients: recipients }, ctx.User, provider);
        runId = queued.CommunicationRunID;
        Assert(queued.Success && queued.IsAsyncRun, `Expected a queued chunked send: ${queued.ErrorMessage ?? ''}`);
        AssertEqual(captured.length, 3, 'Expected 3 comms.dispatch chunks');
        const queuedRun = await loadRun(runId!, ctx.User);
        AssertEqual(queuedRun.ChunkCount, 3, 'Expected the run to store ChunkCount = 3 before any chunk runs');
        Assert(queuedRun.Status !== 'Complete' && queuedRun.EndedAt == null, 'The run must stay open until its chunks finish');

        const runChunk = async (index: number): Promise<void> => {
          const chunk = readDispatchChunk(captured[index]);
          AssertEqual(chunk.Index, index, 'Chunks are published in order');
          const res = await sendService.Send(
            { ...base, CommunicationRunID: chunk.RunID, RunChunk: { Index: chunk.Index, Count: chunk.Count }, Recipients: [recipients[index]] },
            ctx.User,
            provider,
          );
          Assert(res.Success, `Chunk ${index} failed: ${res.ErrorMessage ?? ''}`);
        };

        await runChunk(2);
        await runChunk(1);
        await runChunk(1); // a redelivery must not count twice
        AssertEqual(await countRunChunks(runId!, ctx.User), 2, 'A redelivered chunk must not add a second Run Chunk row');
        const midRun = await loadRun(runId!, ctx.User);
        Assert(midRun.Status !== 'Complete' && midRun.EndedAt == null, 'The run must not end before its last chunk');

        await runChunk(0);
        AssertEqual(await countRunChunks(runId!, ctx.User), 3, 'Expected exactly 3 Run Chunk rows');
        const finished = await loadRun(runId!, ctx.User);
        AssertEqual(finished.Status, 'Complete', 'Expected the run Complete once every chunk finished');
        Assert(finished.EndedAt != null, 'Expected EndedAt on the finished run');
      } finally {
        const cleanup = new CommsCleanup(BUNDLE, ctx.User);
        await cleanupRunAndLogs(cleanup, runId);
        await cleanupEndpointsByAddress(cleanup, addresses);
        cleanup.Report();
      }
    },
  },
  {
    Id: 'comms-v2-send.CV2S6',
    Name: 'CV2S6: a log stuck In-Progress is never resent under At Most Once and is reclaimed under At Least Once',
    Fn: async (ctx: IntegrationCheckContext) => {
      Assert(ctx.Pool != null, 'CV2S6 needs the server transport (a raw SQL pool) to age a log');
      const { sender, channel, providerId } = await loadEmailContext(ctx);
      const runTag = NewCommsRunTag('cv2s6');
      const address = CommsTestAddress(runTag);
      const provider = new CountingTestProvider();
      const sendService = new V2SendService();
      let endpoint: MJCommunicationEndpointEntity | undefined;
      let runId: string | undefined;
      try {
        endpoint = await saveTestEndpoint(ctx, channel.ID, address);
        const params = (runIdParam?: string, guarantee?: 'At Least Once'): SendToPrincipalsParams => ({
          CommunicationRunID: runIdParam,
          Envelope: {
            SenderID: sender.ID,
            ProviderID: providerId,
            MessageClass: 'Operational',
            ChannelID: channel.ID,
            DryRun: true,
            DeliveryGuarantee: guarantee,
          },
          Payload: { Subject: `CV2S6 ${runTag} ${COMMS_IT_TAG}`, Body: 'Stuck log' },
          Recipients: [{ Endpoint: { CommunicationEndpointID: endpoint!.ID } }],
        });

        const first = await sendService.Send(params(), ctx.User, () => provider);
        runId = first.CommunicationRunID;
        const logId = first.Outcomes?.[0]?.CommunicationLogID;
        Assert(first.Success && runId != null && logId != null, `Expected the first send to write a log: ${first.ErrorMessage ?? ''}`);
        AssertEqual(provider.SendCalls, 1, 'Expected one provider call for the first send');

        // Fixture: the worker "died" after the provider call, before the log was updated.
        const schema = ctx.Schema ?? '__mj';
        await ctx.Pool!.request().query(
          `UPDATE [${schema}].[CommunicationLog]
           SET Status = 'In-Progress', ProviderMessageID = NULL, __mj_UpdatedAt = DATEADD(MINUTE, -20, GETUTCDATE())
           WHERE ID = '${EscapeSQLString(logId!)}'`,
        );
        const aged = await readLogRaw(ctx, logId!);

        const atMostOnce = await sendService.Send(params(runId), ctx.User, () => provider);
        const amo = atMostOnce.Outcomes?.[0];
        AssertEqual(amo?.Status, 'Failed', `Expected Failed under At Most Once (detail: ${amo?.Detail ?? ''})`);
        AssertEqual(amo?.Reason, 'OutcomeUnknown', 'Expected reason OutcomeUnknown under At Most Once');
        AssertEqual(provider.SendCalls, 1, 'At Most Once must not call the provider again');
        const untouched = await readLogRaw(ctx, logId!);
        AssertEqual(untouched.Status, 'In-Progress', 'The stuck log must be left for reconciliation');
        AssertEqual(untouched.UpdatedAt.getTime(), aged.UpdatedAt.getTime(), 'The stuck log must not be reclaimed');

        const atLeastOnce = await sendService.Send(params(runId, 'At Least Once'), ctx.User, () => provider);
        const alo = atLeastOnce.Outcomes?.[0];
        AssertEqual(alo?.Status, 'DryRun', `Expected the stuck log reclaimed and sent under At Least Once (reason: ${alo?.Reason ?? ''}, detail: ${alo?.Detail ?? ''})`);
        AssertEqual(provider.SendCalls, 2, 'At Least Once must send exactly once more');
        AssertEqual(alo?.CommunicationLogID?.toLowerCase(), logId!.toLowerCase(), 'The same log must be reclaimed, not a new one written');
        AssertEqual((await readLogRaw(ctx, logId!)).Status, 'Complete', 'Expected the reclaimed log Complete');
      } finally {
        const cleanup = new CommsCleanup(BUNDLE, ctx.User);
        await cleanupRunAndLogs(cleanup, runId);
        await cleanup.DeleteEndpointDependents(endpoint?.IsSaved ? [endpoint.ID] : []);
        await cleanup.Delete(endpoint, 'CV2S6 fixture endpoint');
        cleanup.Report();
      }
    },
  },
  {
    Id: 'comms-v2-send.CV2S7',
    Name: 'CV2S7: one active Admin Block per address, and an append-only consent audit log, enforced by the database',
    Fn: async (ctx: IntegrationCheckContext) => {
      Assert(ctx.Pool != null, 'CV2S7 needs the server transport (a raw SQL pool)');
      const { channel } = await loadEmailContext(ctx);
      const runTag = NewCommsRunTag('cv2s7');
      const schema = ctx.Schema ?? '__mj';
      let endpoint: MJCommunicationEndpointEntity | undefined;
      const suppressionIds: string[] = [];
      const saved: MJCommunicationSuppressionEntity[] = [];
      try {
        endpoint = await saveTestEndpoint(ctx, channel.ID, CommsTestAddress(runTag));

        const first = await trySaveAdminBlock(ctx, endpoint, runTag);
        Assert(first.Saved, `Expected the first Admin Block to save: ${first.Suppression.LatestResult?.CompleteMessage ?? ''}`);
        saved.push(first.Suppression);
        suppressionIds.push(first.Suppression.ID);
        const second = await trySaveAdminBlock(ctx, endpoint, runTag);
        if (second.Saved) {
          saved.push(second.Suppression);
          suppressionIds.push(second.Suppression.ID);
        }
        Assert(!second.Saved, 'A second active Admin Block for the same address must be refused');

        first.Suppression.Status = 'Revoked';
        first.Suppression.RevokedAt = new Date();
        Assert(await first.Suppression.Save(), `Revoking the first block failed: ${first.Suppression.LatestResult?.CompleteMessage ?? ''}`);
        const third = await trySaveAdminBlock(ctx, endpoint, runTag);
        Assert(third.Saved, `A new Admin Block after revoking the old one must save: ${third.Suppression.LatestResult?.CompleteMessage ?? ''}`);
        saved.push(third.Suppression);
        suppressionIds.push(third.Suppression.ID);

        const audit = await ctx.Provider.GetEntityObject<MJCommunicationConsentAuditLogEntity>('MJ: Communication Consent Audit Logs', ctx.User);
        audit.CommunicationSuppressionID = third.Suppression.ID;
        audit.Action = 'Created';
        audit.Source = 'Admin';
        Assert(await audit.Save(), `Expected the audit row to save: ${audit.LatestResult?.CompleteMessage ?? ''}`);
        const auditId = audit.ID;

        audit.Source = 'API';
        Assert(await isRefused(() => audit.Save()), 'Updating an audit row through the entity must be refused');
        Assert(await isRefused(() => audit.Delete()), 'Deleting an audit row through the entity must be refused');

        const updateError = await expectSqlRefused(
          ctx,
          `UPDATE [${schema}].[CommunicationConsentAuditLog] SET Source = 'API' WHERE ID = '${EscapeSQLString(auditId)}'`,
          'A raw UPDATE of an audit row',
        );
        Assert(updateError.includes('append-only'), `Expected the trigger's refusal, got: ${updateError}`);
        const deleteError = await expectSqlRefused(
          ctx,
          `DELETE FROM [${schema}].[CommunicationConsentAuditLog] WHERE ID = '${EscapeSQLString(auditId)}'`,
          'A raw DELETE of an audit row',
        );
        Assert(deleteError.includes('append-only'), `Expected the trigger's refusal, got: ${deleteError}`);

        const still = await ctx.Pool!.request().query<{ Source: string }>(
          `SELECT Source FROM [${schema}].[CommunicationConsentAuditLog] WHERE ID = '${EscapeSQLString(auditId)}'`,
        );
        AssertEqual(still.recordset.length, 1, 'The audit row must still exist');
        AssertEqual(still.recordset[0].Source, 'Admin', 'The audit row must be unchanged');
      } finally {
        const cleanup = new CommsCleanup(BUNDLE, ctx.User);
        await eraseAuditRows(ctx, cleanup, suppressionIds);
        for (const supp of saved) await cleanup.Delete(supp, 'CV2S7 fixture suppression');
        await cleanup.Delete(endpoint, 'CV2S7 fixture endpoint');
        cleanup.Report();
      }
    },
  },
];

for (const check of CommsV2SendChecks) {
  IntegrationCheckRegistry.Instance.Register(check);
}
