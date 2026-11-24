/**
 * CommsWorkQueueHandlers: the `comms.dispatch`, `comms.render` and `comms.activity` work handlers,
 * and `ConfigureCommsV2WorkQueue`, which wires the engines to publish onto the work queue.
 *
 * The handler contract (guides/WORK_QUEUE_CONSUMER_GUIDE.md §7): `Outcome.Complete()` when done,
 * `Outcome.Retry(reason)` for a transient failure, `Outcome.DeadLetter(reason)` for input that can
 * never succeed, and anything thrown is treated as a retry. Delivery is at least once, so a
 * handler can run twice for one `MessageID`.
 *
 * Messages are built by a JSON round trip, because that is what a transport delivers: a `Date`
 * the producer put in the payload arrives as an ISO string.
 *
 * The SendGrid provider and its ECDSA verification are real; the engines, the activity worker,
 * the queue and the key lookup are doubles that can each fail.
 */
import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { NormalizedActivityEvent, SendingEnvelope, SendV2Result } from '@memberjunction/communication-types';
import type { RenderBatchPayload } from '@memberjunction/entity-communications-server';
import type { PublishRequest, PublishResult, WorkContext, WorkJson, WorkMessage } from '@memberjunction/work-queue-core';
import type { CommsActivityWorkPayload } from '../rest/CommsWebhookHandler.js';
import { FakeMetadataProvider } from './commsTestFakes.js';
import { MakeUser } from './commsTestUsers.js';

interface BatchResult {
  ProcessedCount: number;
  DuplicateCount: number;
  ErrorCount: number;
}

/** An argument a double recorded: the engines here are called with flags, users and providers. */
type RecordedArg = boolean | object | undefined;

const state = vi.hoisted(() => ({
  // CommunicationEngine
  engineConfig: [] as Array<{ Args: RecordedArg[] }>,
  engineConfigError: undefined as Error | undefined,
  engineContextUser: undefined as object | undefined,
  sendCalls: [] as Array<{ Params: object; User: object | undefined }>,
  sendImpl: undefined as ((params: object) => Promise<object>) | undefined,
  providerEntities: [] as Array<{ ID: string; Name: string }>,
  getProvider: undefined as ((name: string) => object | undefined) | undefined,
  dispatchConfig: [] as object[],
  sweepStarts: 0,
  // CommsActivityWorker
  batchCalls: [] as Array<{ Events: object[]; User: object | undefined }>,
  batchImpl: undefined as ((events: object[]) => Promise<object>) | undefined,
  // TemplatedCommunicationService
  renderCalls: [] as Array<{ Payload: object; User: object | undefined; Extra: RecordedArg[] }>,
  renderImpl: undefined as ((payload: object) => Promise<object>) | undefined,
  templatedConfig: [] as object[],
  // WorkQueueEngine
  topics: [] as object[],
  queueConfig: [] as Array<{ Args: RecordedArg[] }>,
  publishCalls: [] as Array<{ Topic: string; Requests: object[] }>,
  publishImpl: undefined as ((topic: string, requests: object[]) => Promise<object[]>) | undefined,
  // UserCache
  cachedUsers: [] as Array<{ ID: string }>,
  // Webhook key lookup
  keyRequests: [] as Array<string | undefined>,
  resolveKey: undefined as ((credentialId?: string) => Promise<string | undefined>) | undefined,
}));

vi.mock('@memberjunction/communication-engine', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/communication-engine')>('@memberjunction/communication-engine');
  class CommsActivityWorker {
    public async ProcessActivityBatch(events: object[], user?: object, ...rest: RecordedArg[]): Promise<object> {
      state.batchCalls.push({ Events: events, User: user });
      expect(rest).toEqual([]);
      return state.batchImpl ? state.batchImpl(events) : { ProcessedCount: events.length, DuplicateCount: 0, ErrorCount: 0 };
    }
  }
  return {
    ...actual,
    CommsActivityWorker,
    CommunicationEngine: {
      Instance: {
        Config: async (...args: RecordedArg[]) => {
          state.engineConfig.push({ Args: args });
          if (state.engineConfigError) throw state.engineConfigError;
        },
        Send: async (params: object, user?: object) => {
          state.sendCalls.push({ Params: params, User: user });
          return state.sendImpl
            ? state.sendImpl(params)
            : { Success: true, IsAsyncRun: false, TotalCount: 1, QueuedCount: 1, BlockedCount: 0, DeferredCount: 0 };
        },
        GetProvider: (name: string) => state.getProvider?.(name),
        get Providers() {
          return state.providerEntities;
        },
        get ContextUser() {
          return state.engineContextUser;
        },
        ConfigureV2Dispatch: (config: object) => {
          state.dispatchConfig.push(config);
        },
        StartScheduledDeferralSweep: () => {
          state.sweepStarts++;
        },
      },
    },
  };
});

vi.mock('@memberjunction/entity-communications-server', () => ({
  TemplatedCommunicationService: {
    Instance: {
      HandleRenderBatch: async (payload: object, user?: object, ...extra: RecordedArg[]) => {
        state.renderCalls.push({ Payload: payload, User: user, Extra: extra });
        return state.renderImpl
          ? state.renderImpl(payload)
          : { Success: true, IsAsyncRun: false, TotalCount: 1, QueuedCount: 1, BlockedCount: 0, DeferredCount: 0 };
      },
      Configure: (config: object) => {
        state.templatedConfig.push(config);
      },
    },
  },
}));

vi.mock('@memberjunction/work-queue-engine', async () => {
  const handlers = await vi.importActual<typeof import('../../../WorkQueue/engine/src/handlers/BaseWorkHandler.js')>(
    '../../../WorkQueue/engine/src/handlers/BaseWorkHandler.js',
  );
  return {
    // The real base class, loaded on its own so the engine's transports are not pulled in.
    BaseWorkHandler: handlers.BaseWorkHandler,
    WorkQueueEngine: {
      Instance: {
        get Topics() {
          return state.topics;
        },
        Config: async (...args: RecordedArg[]) => {
          state.queueConfig.push({ Args: args });
        },
        Publish: async (topic: string, requests: object[]) => {
          state.publishCalls.push({ Topic: topic, Requests: requests });
          return state.publishImpl ? state.publishImpl(topic, requests) : requests.map(() => ({ MessageID: 'msg-accepted', Status: 'Accepted' }));
        },
      },
    },
  };
});

vi.mock('@memberjunction/sqlserver-dataprovider', () => ({
  UserCache: {
    Instance: {
      UserByID: (id: string) => state.cachedUsers.find((u) => u.ID === id),
    },
  },
}));

vi.mock('../rest/CommsWebhookHandler.js', () => ({
  ResolveSendGridWebhookVerificationKey: async (credentialId?: string) => {
    state.keyRequests.push(credentialId);
    return state.resolveKey ? state.resolveKey(credentialId) : undefined;
  },
}));

import { SendGridProvider } from '@memberjunction/communication-sendgrid';
import {
  COMMS_ACTIVITY_HANDLER_KEY,
  COMMS_DISPATCH_HANDLER_KEY,
  COMMS_RENDER_HANDLER_KEY,
  CommsActivityWorkHandler,
  CommsDispatchWorkHandler,
  CommsRenderWorkHandler,
  ConfigureCommsV2WorkQueue,
  ReviveSendingEnvelope,
  type CommsDispatchWorkPayload,
} from '../services/CommsWorkQueueHandlers.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** The user a work-queue host binds to every handler: the system user (see BaseWorkHandler). */
const SYSTEM_USER = MakeUser({ ID: 'user-system', Name: 'System', Email: 'not.set@nowhere.com', Type: 'Owner          ' });
/** The user who started the send. */
const REQUESTING_USER = MakeUser({ ID: 'user-requester', Name: 'Rae', Email: 'rae@example.com', Type: 'User           ' });

const SENDGRID_PROVIDER_ID = 'prov-sendgrid';

let deliveryProvider: IMetadataProvider;
let warnings: string[];

function makeContext(overrides: Partial<Pick<WorkContext, 'Attempt' | 'IsReplay'>> = {}): WorkContext {
  return {
    SubscriptionName: 'comms-workers',
    DeliveryID: 'delivery-1',
    Attempt: 1,
    MaxAttempts: 5,
    IsReplay: false,
    Signal: new AbortController().signal,
    Heartbeat: async () => true,
    Log: {
      Info: () => undefined,
      Warn: (message: string) => {
        warnings.push(message);
      },
      Error: () => undefined,
    },
    ...overrides,
  };
}

/** A message as a transport delivers it: the payload has been through JSON. */
function deliver<T extends WorkJson>(topic: string, payload: object | undefined, messageID = 'msg-0001'): WorkMessage<T> {
  return {
    MessageID: messageID,
    Topic: topic,
    Attributes: {},
    Payload: payload === undefined ? undefined : (JSON.parse(JSON.stringify(payload)) as T),
    PublishedAt: '2026-11-20T12:00:00.000Z',
  };
}

function bind<T extends { BindExecutionContext(ctx: { ContextUser: UserInfo; Provider: IMetadataProvider }): void }>(handler: T): T {
  handler.BindExecutionContext({ ContextUser: SYSTEM_USER, Provider: deliveryProvider });
  return handler;
}

const sendResult = (overrides: Partial<SendV2Result>): SendV2Result => ({
  Success: true,
  IsAsyncRun: false,
  TotalCount: 2,
  QueuedCount: 2,
  BlockedCount: 0,
  DeferredCount: 0,
  ...overrides,
});

const ENVELOPE: SendingEnvelope = { SenderID: 'sender-1', MessageClass: 'Marketing', ChannelID: 'chan-email' };

const DISPATCH_PAYLOAD: CommsDispatchWorkPayload = {
  CommunicationRunID: 'run-42',
  Envelope: ENVELOPE,
  Payload: { Subject: 'Hello', Body: 'Hi there' },
  Recipients: [{ Principal: { EntityID: 'entity-contacts', RecordID: 'contact-1' } }, { Endpoint: { Address: 'b@example.com' } }],
};

beforeEach(() => {
  deliveryProvider = new FakeMetadataProvider('delivery-provider').AsProvider();
  warnings = [];
  state.engineConfig = [];
  state.engineConfigError = undefined;
  state.engineContextUser = SYSTEM_USER;
  state.sendCalls = [];
  state.sendImpl = undefined;
  state.providerEntities = [{ ID: SENDGRID_PROVIDER_ID, Name: 'SendGrid' }];
  state.getProvider = () => new SendGridProvider();
  state.dispatchConfig = [];
  state.sweepStarts = 0;
  state.batchCalls = [];
  state.batchImpl = undefined;
  state.renderCalls = [];
  state.renderImpl = undefined;
  state.templatedConfig = [];
  state.topics = [{ Name: 'comms.dispatch' }];
  state.queueConfig = [];
  state.publishCalls = [];
  state.publishImpl = undefined;
  state.cachedUsers = [SYSTEM_USER, REQUESTING_USER];
  state.keyRequests = [];
  state.resolveKey = undefined;
});

// ─── comms.dispatch ──────────────────────────────────────────────────────────

describe('CommsDispatchWorkHandler (comms.dispatch)', () => {
  type DispatchMessage = CommsDispatchWorkPayload & WorkJson;
  const handle = (payload: object | undefined, messageID?: string) =>
    bind(new CommsDispatchWorkHandler()).Handle(deliver<DispatchMessage>(COMMS_DISPATCH_HANDLER_KEY, payload, messageID), makeContext());

  it('sends the chunk under its run ID and completes', async () => {
    const outcome = await handle(DISPATCH_PAYLOAD);

    expect(outcome).toEqual({ Kind: 'Complete' });
    expect(state.sendCalls).toHaveLength(1);
    expect(state.sendCalls[0].Params).toEqual({
      CommunicationRunID: 'run-42',
      Envelope: ENVELOPE,
      Payload: { Subject: 'Hello', Body: 'Hi there' },
      Recipients: DISPATCH_PAYLOAD.Recipients,
    });
  });

  it('returns Retry with the send error, and logs a warning, when the send could not start', async () => {
    state.sendImpl = async () => sendResult({ Success: false, ErrorMessage: "Communication run 'run-42' was not found" });

    const outcome = await handle(DISPATCH_PAYLOAD);

    expect(outcome).toEqual({ Kind: 'Retry', Reason: "Communication run 'run-42' was not found" });
    expect(warnings).toEqual(["comms.dispatch failed and will retry: Communication run 'run-42' was not found"]);
  });

  it('returns Retry with a default reason when the failed send gives no message', async () => {
    state.sendImpl = async () => sendResult({ Success: false });

    expect(await handle(DISPATCH_PAYLOAD)).toEqual({ Kind: 'Retry', Reason: 'comms.dispatch send failed' });
  });

  it('completes when the send started but individual recipients were blocked or failed', async () => {
    // SendV2Result.Success is false only when the send could not start; per-recipient failures
    // are counts and Outcomes. The handler does not look at them, so the chunk is not retried.
    state.sendImpl = async () => sendResult({ Success: true, QueuedCount: 0, BlockedCount: 1, Outcomes: [] });

    expect(await handle(DISPATCH_PAYLOAD)).toEqual({ Kind: 'Complete' });
  });

  it('lets a thrown send error propagate, which the queue treats as a retry', async () => {
    state.sendImpl = async () => {
      throw new Error('Metadata not loaded. Call Config() before accessing metadata.');
    };

    await expect(handle(DISPATCH_PAYLOAD)).rejects.toThrow('Metadata not loaded');
  });

  it('does not send when the engine cannot be configured', async () => {
    state.engineConfigError = new Error('Login failed for user');

    await expect(handle(DISPATCH_PAYLOAD)).rejects.toThrow('Login failed');
    expect(state.sendCalls).toHaveLength(0);
  });

  it.each([
    ['no payload at all', undefined],
    ['no Envelope', { CommunicationRunID: 'run-42', Recipients: [] }],
    ['Recipients that is not an array', { Envelope: ENVELOPE, Recipients: 'everyone' }],
    ['no Recipients', { Envelope: ENVELOPE }],
  ])('dead-letters a payload with %s without configuring or sending', async (_label, payload) => {
    const outcome = await handle(payload);

    expect(outcome).toEqual({ Kind: 'DeadLetter', Reason: 'Invalid comms.dispatch payload: missing Envelope or Recipients' });
    expect(state.engineConfig).toHaveLength(0);
    expect(state.sendCalls).toHaveLength(0);
  });

  it('on redelivery sends again under the same run ID and adds no guard of its own', async () => {
    // The handler passes no MessageID and holds no lock: a redelivered chunk reaches Send() a
    // second time with identical arguments. Not sending twice rests entirely on Send() skipping
    // recipients that already have a log for (CommunicationRunID, endpoint).
    const handler = bind(new CommsDispatchWorkHandler());
    const message = deliver<DispatchMessage>(COMMS_DISPATCH_HANDLER_KEY, DISPATCH_PAYLOAD, 'msg-redelivered');

    const first = await handler.Handle(message, makeContext({ Attempt: 1 }));
    const second = await handler.Handle(message, makeContext({ Attempt: 2 }));

    expect([first, second]).toEqual([{ Kind: 'Complete' }, { Kind: 'Complete' }]);
    expect(state.sendCalls).toHaveLength(2);
    expect(state.sendCalls[1].Params).toEqual(state.sendCalls[0].Params);
    expect(state.sendCalls.every((c) => (c.Params as CommsDispatchWorkPayload).CommunicationRunID === 'run-42')).toBe(true);
    expect(JSON.stringify(state.sendCalls)).not.toContain('msg-redelivered');
  });

  it('runs as the user the host bound (the system user): the payload carries no requesting user', async () => {
    // FLAG: the dispatch payload has no acting-user field, so everything Send() reads while
    // dispatching a queued chunk (principal records, endpoints, preferences) is read as the
    // system user, not as the user who started the send. `comms.render` carries ActingUserID;
    // `comms.dispatch` does not.
    await handle(DISPATCH_PAYLOAD);

    expect(state.engineConfig[0].Args.slice(0, 2)).toEqual([false, SYSTEM_USER]);
    expect(state.sendCalls[0].User).toBe(SYSTEM_USER);
    expect(Object.keys(DISPATCH_PAYLOAD).sort()).toEqual(['CommunicationRunID', 'Envelope', 'Payload', 'Recipients']);
  });

  it('hands Send() an Envelope whose ScheduledAt is a Date again after the queue round trip', async () => {
    const scheduled: CommsDispatchWorkPayload = {
      ...DISPATCH_PAYLOAD,
      Envelope: { ...ENVELOPE, ScheduledAt: new Date('2026-12-01T09:00:00.000Z') },
    };

    await handle(scheduled);

    const sent = state.sendCalls[0].Params as CommsDispatchWorkPayload;
    expect(sent.Envelope.ScheduledAt).toBeInstanceOf(Date);
  });

  it("passes the chunk's place in its run to Send(), so the last chunk can close the run", async () => {
    await handle({ ...DISPATCH_PAYLOAD, RunChunk: { Index: 2, Count: 5 } });

    const sent = state.sendCalls[0].Params as CommsDispatchWorkPayload;
    expect(sent.RunChunk).toEqual({ Index: 2, Count: 5 });
  });

  it('passes no chunk position for a payload that carries none', async () => {
    await handle(DISPATCH_PAYLOAD);

    expect((state.sendCalls[0].Params as CommsDispatchWorkPayload).RunChunk).toBeUndefined();
  });

  it('configures the engine on the provider the host bound to this delivery', async () => {
    await handle(DISPATCH_PAYLOAD);

    expect(state.engineConfig[0].Args).toContain(deliveryProvider);
  });
});

// ─── comms.render ────────────────────────────────────────────────────────────

describe('CommsRenderWorkHandler (comms.render)', () => {
  type RenderMessage = RenderBatchPayload & WorkJson;
  const RENDER_PAYLOAD: RenderBatchPayload = {
    CommunicationRunID: 'run-42',
    Envelope: ENVELOPE,
    EntityID: 'entity-contacts',
    Templates: { BodyTemplateID: 'tmpl-body' },
    AutoAppendComplianceFooter: true,
    Recipients: [
      {
        Principal: { EntityID: 'entity-contacts', RecordID: 'contact-1' },
        Endpoint: {
          CommunicationEndpointID: 'ep-1',
          ChannelID: 'chan-email',
          NormalizedValue: 'a@example.com',
          RawValue: 'A@Example.com',
          ValueHash: 'hash-a',
        },
        Decision: 'Allowed',
        Obligations: {
          RequireOneClickHeader: true,
          RequireFooterUnsubscribe: true,
          RequireSenderPostalAddress: false,
          AllowOpenPixel: true,
          AllowClickTracking: true,
        },
      },
    ],
    ActingUserID: REQUESTING_USER.ID,
  };
  const handle = (payload: object | undefined) => bind(new CommsRenderWorkHandler()).Handle(deliver<RenderMessage>(COMMS_RENDER_HANDLER_KEY, payload));

  it('renders the batch and completes', async () => {
    const outcome = await handle(RENDER_PAYLOAD);

    expect(outcome).toEqual({ Kind: 'Complete' });
    expect(state.renderCalls).toHaveLength(1);
    expect(state.renderCalls[0].Payload).toEqual(JSON.parse(JSON.stringify(RENDER_PAYLOAD)));
  });

  it('returns Retry with the batch error when rendering fails', async () => {
    state.renderImpl = async () =>
      sendResult({ Success: false, ErrorMessage: "Acting user 'user-requester' could not be resolved for async template rendering" });

    expect(await handle(RENDER_PAYLOAD)).toEqual({
      Kind: 'Retry',
      Reason: "Acting user 'user-requester' could not be resolved for async template rendering",
    });
  });

  it('returns Retry with a default reason when the failed batch gives no message', async () => {
    state.renderImpl = async () => sendResult({ Success: false });

    expect(await handle(RENDER_PAYLOAD)).toEqual({ Kind: 'Retry', Reason: 'comms.render batch failed' });
  });

  it('lets a thrown render error propagate, which the queue treats as a retry', async () => {
    state.renderImpl = async () => {
      throw new Error('Template tmpl-body not found');
    };

    await expect(handle(RENDER_PAYLOAD)).rejects.toThrow('Template tmpl-body not found');
  });

  it('does not render when the engine cannot be configured', async () => {
    state.engineConfigError = new Error('connection pool closed');

    await expect(handle(RENDER_PAYLOAD)).rejects.toThrow('connection pool closed');
    expect(state.renderCalls).toHaveLength(0);
  });

  it.each([
    ['no payload at all', undefined],
    ['no Envelope', { CommunicationRunID: 'run-42', Recipients: [] }],
    ['Recipients that is not an array', { Envelope: ENVELOPE, Recipients: {} }],
  ])('dead-letters a payload with %s without rendering', async (_label, payload) => {
    expect(await handle(payload)).toEqual({ Kind: 'DeadLetter', Reason: 'Invalid comms.render payload: missing Envelope or Recipients' });
    expect(state.renderCalls).toHaveLength(0);
  });

  it("passes the bound system user plus the payload's ActingUserID, leaving the acting-user switch to the service", async () => {
    // The handler itself runs as the host's system user. Rendering as the requesting user
    // depends on HandleRenderBatch resolving `ActingUserID` through the ResolveUser hook that
    // ConfigureCommsV2WorkQueue installs (tested below).
    await handle(RENDER_PAYLOAD);

    expect(state.renderCalls[0].User).toBe(SYSTEM_USER);
    expect((state.renderCalls[0].Payload as RenderBatchPayload).ActingUserID).toBe(REQUESTING_USER.ID);
  });

  it('renders as the system user when the payload names no acting user', async () => {
    // FLAG: with no ActingUserID, TemplatedCommunicationService.HandleRenderBatch
    // (`let renderUser = user`) renders with the user it was handed, which here is
    // the system user: template data for the recipients is then loaded with no RLS/FLS.
    const anonymous: RenderBatchPayload = { ...RENDER_PAYLOAD, ActingUserID: undefined };

    await handle(anonymous);

    expect(state.renderCalls[0].User).toBe(SYSTEM_USER);
    expect((state.renderCalls[0].Payload as RenderBatchPayload).ActingUserID).toBeUndefined();
  });

  it('passes the provider the host bound to this delivery to HandleRenderBatch', async () => {
    await handle(RENDER_PAYLOAD);

    expect(state.renderCalls[0].Extra).toEqual([deliveryProvider]);
  });

  it('passes no provider when the bound one cannot run views, rather than one the render path cannot use', async () => {
    const metadataOnly = { Name: 'metadata-only' } as Partial<IMetadataProvider>;
    const handler = new CommsRenderWorkHandler();
    handler.BindExecutionContext({ ContextUser: SYSTEM_USER, Provider: metadataOnly as IMetadataProvider });

    await handler.Handle(deliver<RenderMessage>(COMMS_RENDER_HANDLER_KEY, RENDER_PAYLOAD));

    expect(state.renderCalls[0].Extra).toEqual([undefined]);
  });

  it('revives ScheduledAt as a Date from the ISO string the queue delivers, and leaves it out when absent', () => {
    const when = new Date('2026-12-01T09:00:00.000Z');

    expect(ReviveSendingEnvelope({ ...ENVELOPE, ScheduledAt: when.toISOString() }).ScheduledAt).toEqual(when);
    expect(ReviveSendingEnvelope({ ...ENVELOPE, ScheduledAt: when }).ScheduledAt).toBe(when);
    expect('ScheduledAt' in ReviveSendingEnvelope(ENVELOPE)).toBe(false);
  });
});

// ─── comms.activity ──────────────────────────────────────────────────────────

describe('CommsActivityWorkHandler (comms.activity)', () => {
  type ActivityMessage = CommsActivityWorkPayload & WorkJson;
  const handle = (payload: object | undefined, messageID?: string) =>
    bind(new CommsActivityWorkHandler()).Handle(deliver<ActivityMessage>(COMMS_ACTIVITY_HANDLER_KEY, payload, messageID));

  const processedEvents = (call = 0): NormalizedActivityEvent[] => state.batchCalls[call].Events as NormalizedActivityEvent[];
  const batchResult = (overrides: Partial<BatchResult>): BatchResult => ({ ProcessedCount: 0, DuplicateCount: 0, ErrorCount: 0, ...overrides });

  let publicKeyPem: string;
  let privateKeyPem: string;

  beforeEach(() => {
    const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    state.resolveKey = async () => publicKeyPem;
  });

  const SENDGRID_EVENTS = [
    { event: 'delivered', email: 'A@Example.com', sg_event_id: 'evt-1', sg_message_id: 'sgmsg-1', timestamp: 1_700_000_000 },
    {
      event: 'bounce',
      email: 'b@example.com',
      sg_event_id: 'evt-2',
      sg_message_id: 'sgmsg-2',
      timestamp: 1_700_000_001,
      type: 'bounce',
      reason: '550 no such user',
    },
  ];

  /** A `sendgrid-webhook` payload as the HTTP ingress publishes it: raw body plus the signed headers. */
  function signedWebhookPayload(rawBody: string, options: { signedAtSec?: number; credentialID?: string; signWith?: string } = {}): CommsActivityWorkPayload {
    const timestamp = String(options.signedAtSec ?? Math.floor(Date.now() / 1000));
    const signer = crypto.createSign('SHA256');
    signer.update(timestamp);
    signer.update(rawBody);
    signer.end();
    return {
      Source: 'sendgrid-webhook',
      OccurredAt: '2026-11-20T12:00:00.000Z',
      ...(options.credentialID ? { CredentialID: options.credentialID } : {}),
      RawBody: rawBody,
      Headers: {
        'content-type': 'application/json',
        'x-twilio-email-event-webhook-signature': signer.sign(options.signWith ?? privateKeyPem, 'base64'),
        'x-twilio-email-event-webhook-timestamp': timestamp,
      },
    };
  }

  it('dead-letters a payload with no Source', async () => {
    expect(await handle({ OccurredAt: '2026-11-20T12:00:00.000Z' })).toEqual({
      Kind: 'DeadLetter',
      Reason: 'Invalid comms.activity payload: missing Source',
    });
    expect(await handle(undefined)).toMatchObject({ Kind: 'DeadLetter' });
    expect(state.batchCalls).toHaveLength(0);
  });

  describe('sendgrid-webhook batches', () => {
    it("re-verifies the signature with the credential's key, normalizes the events and completes", async () => {
      const outcome = await handle(signedWebhookPayload(JSON.stringify(SENDGRID_EVENTS), { credentialID: 'cred-sg' }));

      expect(outcome).toEqual({ Kind: 'Complete' });
      expect(state.keyRequests).toEqual(['cred-sg']);
      expect(processedEvents().map((e) => [e.EventType, e.NormalizedAddress, e.ProviderEventID])).toEqual([
        ['Delivered', 'a@example.com', 'evt-1'],
        ['Hard Bounce', 'b@example.com', 'evt-2'],
      ]);
    });

    it('fills in the SendGrid provider ID, which the SendGrid normalizer leaves empty', async () => {
      await handle(signedWebhookPayload(JSON.stringify(SENDGRID_EVENTS)));

      expect(processedEvents().map((e) => e.CommunicationProviderID)).toEqual([SENDGRID_PROVIDER_ID, SENDGRID_PROVIDER_ID]);
    });

    it('leaves the provider ID empty when the engine has no provider named SendGrid', async () => {
      // FLAG: the events are still processed, with CommunicationProviderID ''. The worker keys
      // its duplicate check on `${providerID}:${providerEventID}`.
      state.providerEntities = [{ ID: 'prov-mailgun', Name: 'Mailgun' }];

      const outcome = await handle(signedWebhookPayload(JSON.stringify(SENDGRID_EVENTS)));

      expect(outcome).toEqual({ Kind: 'Complete' });
      expect(processedEvents().map((e) => e.CommunicationProviderID)).toEqual(['', '']);
    });

    it('accepts a signature older than the 10-minute replay window, since ingress already enforced it', async () => {
      const anHourAgo = Math.floor(Date.now() / 1000) - 3600;

      const outcome = await handle(signedWebhookPayload(JSON.stringify(SENDGRID_EVENTS), { signedAtSec: anHourAgo }));

      expect(outcome).toEqual({ Kind: 'Complete' });
      expect(processedEvents()).toHaveLength(2);
    });

    it('throws, and processes nothing, when the body does not match its signature', async () => {
      const payload = signedWebhookPayload(JSON.stringify(SENDGRID_EVENTS));
      payload.RawBody = JSON.stringify([{ ...SENDGRID_EVENTS[0], email: 'attacker@example.com' }]);

      await expect(handle(payload)).rejects.toThrow(/signature/i);
      expect(state.batchCalls).toHaveLength(0);
    });

    it('throws, and processes nothing, when the body was signed with a different key', async () => {
      const other = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const otherPrivate = other.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

      await expect(handle(signedWebhookPayload(JSON.stringify(SENDGRID_EVENTS), { signWith: otherPrivate }))).rejects.toThrow(/signature/i);
      expect(state.batchCalls).toHaveLength(0);
    });

    it('throws, and processes nothing, when the verification key cannot be resolved', async () => {
      state.resolveKey = async () => undefined;

      await expect(handle(signedWebhookPayload(JSON.stringify(SENDGRID_EVENTS), { credentialID: 'cred-gone' }))).rejects.toThrow(
        'Missing SendGrid Event Webhook verification key',
      );
      expect(state.batchCalls).toHaveLength(0);
    });

    it('throws when resolving the verification key throws', async () => {
      state.resolveKey = async () => {
        throw new Error('Credential "SendGrid" has expired');
      };

      await expect(handle(signedWebhookPayload(JSON.stringify(SENDGRID_EVENTS)))).rejects.toThrow('has expired');
      expect(state.batchCalls).toHaveLength(0);
    });

    it('throws when the signed headers did not survive the queue', async () => {
      const payload = signedWebhookPayload(JSON.stringify(SENDGRID_EVENTS));
      delete payload.Headers;

      await expect(handle(payload)).rejects.toThrow();
      expect(state.batchCalls).toHaveLength(0);
    });

    it('completes without processing when the SendGrid provider cannot parse notifications', async () => {
      // FLAG: the batch is dropped silently (Complete, nothing processed), not retried.
      state.getProvider = () => ({});

      const outcome = await handle(signedWebhookPayload(JSON.stringify(SENDGRID_EVENTS)));

      expect(outcome).toEqual({ Kind: 'Complete' });
      expect(state.batchCalls).toHaveLength(0);
    });

    it('completes without calling the worker when the batch holds no event SendGrid recognises', async () => {
      const outcome = await handle(signedWebhookPayload(JSON.stringify([{ event: 'some_future_event', email: 'a@example.com' }])));

      expect(outcome).toEqual({ Kind: 'Complete' });
      expect(state.batchCalls).toHaveLength(0);
    });
  });

  describe('sendgrid-webhook chunks already verified at ingress', () => {
    const chunk = (rawBody: string): CommsActivityWorkPayload => ({
      Source: 'sendgrid-webhook',
      OccurredAt: '2026-11-20T12:00:00.000Z',
      RawBody: rawBody,
      SignatureVerifiedAtIngress: true,
      // The headers carry the signature of the whole body, which no single chunk matches.
      Headers: { 'content-type': 'application/json', 'x-twilio-email-event-webhook-signature': 'sig-of-the-whole-body' },
    });

    it('parses the chunk body directly, without a key lookup or a second signature check', async () => {
      const outcome = await handle(chunk(JSON.stringify(SENDGRID_EVENTS)));

      expect(outcome).toEqual({ Kind: 'Complete' });
      expect(state.keyRequests).toEqual([]);
      expect(processedEvents().map((e) => [e.EventType, e.ProviderEventID, e.CommunicationProviderID])).toEqual([
        ['Delivered', 'evt-1', SENDGRID_PROVIDER_ID],
        ['Hard Bounce', 'evt-2', SENDGRID_PROVIDER_ID],
      ]);
    });

    it('processes each chunk of a split body on its own', async () => {
      const first = await handle(chunk(JSON.stringify([SENDGRID_EVENTS[0]])), 'msg-chunk-1');
      const second = await handle(chunk(JSON.stringify([SENDGRID_EVENTS[1]])), 'msg-chunk-2');

      expect([first, second]).toEqual([{ Kind: 'Complete' }, { Kind: 'Complete' }]);
      expect(processedEvents(0).map((e) => e.ProviderEventID)).toEqual(['evt-1']);
      expect(processedEvents(1).map((e) => e.ProviderEventID)).toEqual(['evt-2']);
    });

    it('completes without processing when the chunk is JSON but not an array', async () => {
      expect(await handle(chunk(JSON.stringify({ event: 'delivered' })))).toEqual({ Kind: 'Complete' });
      expect(state.batchCalls).toHaveLength(0);
    });

    it('throws on a chunk that is not JSON, so a poison chunk is retried rather than dead-lettered', async () => {
      // FLAG: this input can never succeed; the contract's answer for that is DeadLetter. The
      // handler throws a SyntaxError instead, which costs MaxAttempts retries first.
      await expect(handle(chunk('[{"event":"delivered"'))).rejects.toThrow(SyntaxError);
      expect(state.batchCalls).toHaveLength(0);
    });
  });

  describe('per-event results', () => {
    const payload = () => signedWebhookPayload(JSON.stringify(SENDGRID_EVENTS));

    it('returns Retry with the count when any event failed', async () => {
      state.batchImpl = async () => batchResult({ ProcessedCount: 1, ErrorCount: 1 });

      expect(await handle(payload())).toEqual({ Kind: 'Retry', Reason: '1 activity event(s) failed' });
    });

    it('returns Retry when every event failed', async () => {
      state.batchImpl = async () => batchResult({ ErrorCount: 2 });

      expect(await handle(payload())).toEqual({ Kind: 'Retry', Reason: '2 activity event(s) failed' });
    });

    it('completes when every event was a duplicate', async () => {
      state.batchImpl = async () => batchResult({ DuplicateCount: 2 });

      expect(await handle(payload())).toEqual({ Kind: 'Complete' });
    });

    it('lets a worker exception propagate, which the queue treats as a retry', async () => {
      state.batchImpl = async () => {
        throw new Error('deadlock victim');
      };

      await expect(handle(payload())).rejects.toThrow('deadlock victim');
    });

    it('hands the redelivered batch to the worker with the same provider event IDs, its duplicate key', async () => {
      const body = payload();
      state.batchImpl = async () => batchResult({ ProcessedCount: 1, ErrorCount: 1 });
      const first = await handle(body, 'msg-retry');
      state.batchImpl = async () => batchResult({ ProcessedCount: 1, DuplicateCount: 1 });
      const second = await handle(body, 'msg-retry');

      expect(first.Kind).toBe('Retry');
      expect(second).toEqual({ Kind: 'Complete' });
      expect(processedEvents(1).map((e) => e.ProviderEventID)).toEqual(processedEvents(0).map((e) => e.ProviderEventID));
      expect(processedEvents(1).every((e) => Boolean(e.ProviderEventID))).toBe(true);
    });
  });

  describe('tracking events published by the open, click and unsubscribe routes', () => {
    const TRACKING_TOKEN = '22222222-3333-4444-8555-666666666666';

    it('turns an open-pixel hit into one Opened event', async () => {
      const outcome = await handle({
        Source: 'open-pixel',
        EventType: 'Opened',
        TrackingToken: TRACKING_TOKEN,
        OccurredAt: '2026-11-20T12:00:00.000Z',
        IPAddress: '203.0.113.9',
        UserAgent: 'Mozilla/5.0 (Macintosh)',
      });

      expect(outcome).toEqual({ Kind: 'Complete' });
      expect(processedEvents()).toEqual([
        {
          CommunicationProviderID: '',
          ProviderEventID: expect.any(String),
          NormalizedAddress: '',
          EventType: 'Opened',
          OccurredAt: new Date('2026-11-20T12:00:00.000Z'),
          Source: 'Provider Webhook',
          TrackingToken: TRACKING_TOKEN,
          UnsubscribeToken: undefined,
          TargetURL: undefined,
          IPAddress: '203.0.113.9',
          UserAgent: 'Mozilla/5.0 (Macintosh)',
          IsMachineEvent: false,
        },
      ]);
    });

    it('carries the target URL of a click', async () => {
      await handle({
        Source: 'click-redirect',
        EventType: 'Clicked',
        TrackingToken: TRACKING_TOKEN,
        TargetURL: 'https://example.com/landing',
        OccurredAt: '2026-11-20T12:00:00.000Z',
      });

      expect(processedEvents()[0]).toMatchObject({ EventType: 'Clicked', TargetURL: 'https://example.com/landing', Source: 'Provider Webhook' });
    });

    it('marks an unsubscribe as coming from the one-click header', async () => {
      await handle({
        Source: 'unsubscribe',
        EventType: 'Unsubscribed',
        UnsubscribeToken: '550e8400-e29b-41d4-a716-446655440000',
        OccurredAt: '2026-11-20T12:00:00.000Z',
      });

      expect(processedEvents()[0]).toMatchObject({
        EventType: 'Unsubscribed',
        Source: 'One-Click Header',
        UnsubscribeToken: '550e8400-e29b-41d4-a716-446655440000',
      });
    });

    it('returns Retry when the tracking event fails', async () => {
      state.batchImpl = async () => batchResult({ ErrorCount: 1 });

      expect(await handle({ Source: 'unsubscribe', EventType: 'Unsubscribed', UnsubscribeToken: 't', OccurredAt: '2026-11-20T12:00:00.000Z' })).toEqual({
        Kind: 'Retry',
        Reason: '1 activity event(s) failed',
      });
    });

    it('completes without processing when the payload has neither a body nor an event type', async () => {
      expect(await handle({ Source: 'open-pixel', OccurredAt: '2026-11-20T12:00:00.000Z' })).toEqual({ Kind: 'Complete' });
      expect(await handle({ Source: 'sendgrid-webhook', OccurredAt: '2026-11-20T12:00:00.000Z' })).toEqual({ Kind: 'Complete' });
      expect(state.batchCalls).toHaveLength(0);
    });

    it('REGRESSION: leaves the provider of a tracking event empty, for the worker to take from the log', async () => {
      // These hits used to be attributed to the provider named "SendGrid", whichever provider
      // had sent the message.
      for (const hit of [
        { Source: 'open-pixel', EventType: 'Opened', TrackingToken: TRACKING_TOKEN },
        { Source: 'click-redirect', EventType: 'Clicked', TrackingToken: TRACKING_TOKEN, TargetURL: 'https://example.com/landing' },
        { Source: 'unsubscribe', EventType: 'Unsubscribed', UnsubscribeToken: '550e8400-e29b-41d4-a716-446655440000' },
      ]) {
        await handle({ ...hit, OccurredAt: '2026-11-20T12:00:00.000Z' });
      }

      expect(state.providerEntities.some((p) => p.Name === 'SendGrid')).toBe(true);
      expect([0, 1, 2].map((call) => processedEvents(call)[0].CommunicationProviderID)).toEqual(['', '', '']);
    });

    it('gives a tracking event an idempotency key, so a redelivered message is not recorded twice', async () => {
      const hit = { Source: 'open-pixel', EventType: 'Opened', TrackingToken: TRACKING_TOKEN, OccurredAt: '2026-11-20T12:00:00.000Z' };

      await handle(hit, 'msg-open-1');
      await handle(hit, 'msg-open-1');

      expect(processedEvents(0)[0].ProviderEventID).toBeTruthy();
      expect(processedEvents(1)[0].ProviderEventID).toBe(processedEvents(0)[0].ProviderEventID);
    });
  });

  it('processes provider activity as the bound system user: a webhook has no requesting user', async () => {
    await handle(signedWebhookPayload(JSON.stringify(SENDGRID_EVENTS)));

    expect(state.engineConfig[0].Args.slice(0, 2)).toEqual([false, SYSTEM_USER]);
    expect(state.batchCalls[0].User).toBe(SYSTEM_USER);
  });

  it('does not process when the engine cannot be configured', async () => {
    state.engineConfigError = new Error('Login failed for user');

    await expect(handle(signedWebhookPayload(JSON.stringify(SENDGRID_EVENTS)))).rejects.toThrow('Login failed');
    expect(state.batchCalls).toHaveLength(0);
  });
});

// ─── ConfigureCommsV2WorkQueue ───────────────────────────────────────────────

describe('ConfigureCommsV2WorkQueue', () => {
  type Enqueue = (taskType: string, payload: object) => Promise<void>;
  interface DispatchConfig {
    BaseTrackingURL?: string;
    TrackingHMACSecret?: string;
    EnqueueWork?: Enqueue;
  }
  interface TemplatedConfig {
    EnqueueWork?: Enqueue;
    ResolveUser?: (userID: string) => UserInfo | undefined;
  }
  const dispatchConfig = (): DispatchConfig => state.dispatchConfig[0];
  const templatedConfig = (): TemplatedConfig => state.templatedConfig[0];

  /** Configures the queue and returns the publish function both engines were given. */
  function configuredEnqueue(): Enqueue {
    ConfigureCommsV2WorkQueue('https://api.example.com/comms', 'hmac-secret');
    const enqueue = dispatchConfig().EnqueueWork;
    if (!enqueue) throw new Error('EnqueueWork was not configured');
    return enqueue;
  }

  it('gives both engines the same publish function, sets the tracking settings, and starts the deferral sweep', () => {
    ConfigureCommsV2WorkQueue('https://api.example.com/comms', 'hmac-secret');

    expect(dispatchConfig()).toMatchObject({ BaseTrackingURL: 'https://api.example.com/comms', TrackingHMACSecret: 'hmac-secret' });
    expect(dispatchConfig().EnqueueWork).toBeTypeOf('function');
    expect(templatedConfig().EnqueueWork).toBe(dispatchConfig().EnqueueWork);
    expect(state.sweepStarts).toBe(1);
  });

  it('falls back to MJ_COMMS_HMAC_SECRET when no secret is passed', () => {
    vi.stubEnv('MJ_COMMS_HMAC_SECRET', 'secret-from-env');
    try {
      ConfigureCommsV2WorkQueue('https://api.example.com/comms');

      expect(dispatchConfig().TrackingHMACSecret).toBe('secret-from-env');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('configures no publish function when the work queue is disabled, so sends stay in-process', () => {
    ConfigureCommsV2WorkQueue(undefined, 'hmac-secret', false);

    expect(dispatchConfig().EnqueueWork).toBeUndefined();
    expect(templatedConfig().EnqueueWork).toBeUndefined();
    expect(state.sweepStarts).toBe(1);
  });

  it('publishes one request holding the payload to the topic named by the task type', async () => {
    await configuredEnqueue()('comms.dispatch', DISPATCH_PAYLOAD);

    expect(state.publishCalls).toEqual([{ Topic: 'comms.dispatch', Requests: [{ Payload: DISPATCH_PAYLOAD }] }]);
    expect(state.queueConfig).toHaveLength(0);
  });

  it("loads the queue metadata first, as the engine's context user, when no topics are loaded yet", async () => {
    state.topics = [];

    await configuredEnqueue()('comms.render', { CommunicationRunID: 'run-42' });

    expect(state.queueConfig).toEqual([{ Args: [false, SYSTEM_USER] }]);
    expect(state.publishCalls).toHaveLength(1);
  });

  it('treats a Duplicate publish as accepted', async () => {
    state.publishImpl = async () => [{ MessageID: 'msg-1', Status: 'Duplicate' } satisfies PublishResult];

    await expect(configuredEnqueue()('comms.dispatch', DISPATCH_PAYLOAD)).resolves.toBeUndefined();
  });

  it('throws with the code and message when the publish is rejected', async () => {
    state.publishImpl = async () => [
      {
        MessageID: 'msg-1',
        Status: 'Rejected',
        Error: { Code: 'PayloadTooLarge', Message: 'payload is 300000 bytes', Retryable: false },
      } satisfies PublishResult,
    ];

    await expect(configuredEnqueue()('comms.dispatch', DISPATCH_PAYLOAD)).rejects.toThrow(
      "WorkQueue publish rejected for 'comms.dispatch' (PayloadTooLarge): payload is 300000 bytes",
    );
  });

  it('throws when a rejection carries no error detail', async () => {
    state.publishImpl = async () => [{ MessageID: 'msg-1', Status: 'Rejected' } satisfies PublishResult];

    await expect(configuredEnqueue()('comms.dispatch', DISPATCH_PAYLOAD)).rejects.toThrow("WorkQueue publish rejected for 'comms.dispatch' (Unknown): ");
  });

  it('lets a publish exception propagate', async () => {
    state.publishImpl = async () => {
      throw new Error('transport unavailable');
    };

    await expect(configuredEnqueue()('comms.dispatch', DISPATCH_PAYLOAD)).rejects.toThrow('transport unavailable');
  });

  it('publishes the payload as given: a Date is still a Date object, not JSON, when it reaches the queue', async () => {
    // toWorkJson is a shallow copy cast to WorkJson. See the
    // ScheduledAt defect above for what happens to it on the consumer side.
    const scheduledAt = new Date('2026-12-01T09:00:00.000Z');

    await configuredEnqueue()('comms.dispatch', { ...DISPATCH_PAYLOAD, Envelope: { ...ENVELOPE, ScheduledAt: scheduledAt } });

    const request = state.publishCalls[0].Requests[0] as PublishRequest<CommsDispatchWorkPayload & WorkJson>;
    expect(request.Payload?.Envelope.ScheduledAt).toBe(scheduledAt);
  });

  it("resolves a render batch's acting user from the user cache, and returns undefined for an unknown one", () => {
    ConfigureCommsV2WorkQueue('https://api.example.com/comms', 'hmac-secret');
    const resolveUser = templatedConfig().ResolveUser;

    expect(resolveUser?.(REQUESTING_USER.ID)).toBe(REQUESTING_USER);
    // Unknown user: undefined, never a fallback to the system user. HandleRenderBatch then
    // fails the batch ("Acting user ... could not be resolved").
    expect(resolveUser?.('user-deleted')).toBeUndefined();
  });
});
