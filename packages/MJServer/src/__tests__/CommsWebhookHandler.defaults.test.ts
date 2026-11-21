/**
 * CommsWebhookHandler with NO overrides: the real `default*` functions the router falls back to
 * (key lookup, queue publish, token verification, preference-center read and save, double opt-in,
 * unsubscribe redirect), driven over HTTP against an in-memory stand-in for the database.
 *
 * The stand-ins fail the way the real system does: views return `Success: false`, `Save()` returns
 * false with `LatestResult.CompleteMessage`, the queue answers `Rejected` or throws, the credential
 * engine throws, and the user cache may have no system user.
 *
 * These routes are public and unauthenticated: there is no requesting user, so every read and write
 * runs as the system user. The tests assert that, and that a missing system user fails closed.
 */
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunViewParams, UserInfo } from '@memberjunction/core';
import { CommunicationEngineBase } from '@memberjunction/communication-types';
import type {
  MJCommunicationEndpointPrincipalEntity,
  MJCommunicationLogEntity,
  MJCommunicationPreferenceEntity,
  MJCommunicationPrincipalPreferenceEntity,
  MJCommunicationSenderEntity,
  MJCommunicationSuppressionEntity,
} from '@memberjunction/core-entities';
import type { PublishResult } from '@memberjunction/work-queue-core';
import {
  CommsFakes,
  FakeMetadataProvider,
  FakeViews,
  FilterText,
  FilterValue,
  MakeFakeEntity,
  type FakeEntity,
  type FakeEntityBehaviour,
} from './commsTestFakes.js';
import { MakeUser } from './commsTestUsers.js';

/** An argument a double recorded: the engines here are called with flags, users and providers. */
type RecordedArg = boolean | object | undefined;

const state = vi.hoisted(() => ({
  systemUser: undefined as object | undefined,
  systemUserError: undefined as Error | undefined,
  credentials: [] as Array<{ ID: string; Name: string; CredentialType: string | null }>,
  credentialRequests: [] as Array<{ Name: string; ContextUser: object | undefined; Subsystem: string | undefined }>,
  resolveCredential: undefined as ((name: string) => { values: Record<string, string> }) | undefined,
  topics: [] as object[],
  queueConfig: [] as Array<{ Args: RecordedArg[] }>,
  publishCalls: [] as Array<{ Topic: string; Requests: Array<{ Payload: object }> }>,
  publishImpl: undefined as ((requests: object[]) => Promise<object[]>) | undefined,
}));

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  const fakes = await import('./commsTestFakes.js');
  return { ...actual, RunView: fakes.CommsFakes.Views.AsRunViewClass() };
});

vi.mock('@memberjunction/generic-database-provider', () => ({
  UserCache: {
    Instance: {
      GetSystemUser: () => {
        if (state.systemUserError) throw state.systemUserError;
        return state.systemUser;
      },
    },
  },
}));

vi.mock('@memberjunction/credentials', () => ({
  CredentialEngine: {
    Instance: {
      Config: async () => undefined,
      getCredentialById: (id: string) => state.credentials.find((c) => c.ID === id),
      GetCredential: async (name: string, options?: { contextUser?: object; subsystem?: string }) => {
        state.credentialRequests.push({ Name: name, ContextUser: options?.contextUser, Subsystem: options?.subsystem });
        if (!state.resolveCredential) throw new Error(`Credential not found: ${name}`);
        return state.resolveCredential(name);
      },
    },
  },
}));

vi.mock('@memberjunction/work-queue-engine', () => ({
  WorkQueueEngine: {
    Instance: {
      get Topics() {
        return state.topics;
      },
      Config: async (...args: RecordedArg[]) => {
        state.queueConfig.push({ Args: args });
      },
      Publish: async (topic: string, requests: Array<{ Payload: object }>) => {
        state.publishCalls.push({ Topic: topic, Requests: requests });
        return state.publishImpl ? state.publishImpl(requests) : requests.map(() => ({ MessageID: 'msg-1', Status: 'Accepted' }));
      },
    },
  },
}));

import {
  CreateCommsWebhookHandler,
  SignClickTrackingUrl,
  type CommsActivityWorkPayload,
  type CommsWebhookHandlerOptions,
  type ConfirmOptInResult,
  type PreferenceCenterData,
  type SavePreferenceChoicesResult,
} from '../rest/CommsWebhookHandler.js';

// ─── In-memory database ──────────────────────────────────────────────────────

type LogRow = Pick<
  MJCommunicationLogEntity,
  'ID' | 'UnsubscribeToken' | 'TrackingToken' | 'EntityID' | 'RecordID' | 'CommunicationEndpointID' | 'CommunicationSenderID'
>;
type SenderRow = Pick<MJCommunicationSenderEntity, 'ID' | 'Name' | 'PreferenceCenterURL' | 'TemplateContext'>;
type EndpointPrincipalRow = Pick<MJCommunicationEndpointPrincipalEntity, 'ID' | 'CommunicationEndpointID' | 'EntityID' | 'RecordID'>;
type PreferenceRow = Pick<
  MJCommunicationPreferenceEntity,
  'ID' | 'CommunicationSenderID' | 'Name' | 'Description' | 'Category' | 'MessageClass' | 'DefaultState' | 'IsUserVisible' | 'DisplayOrder' | 'Status'
>;
type PrincipalPreferenceRow = Pick<
  MJCommunicationPrincipalPreferenceEntity,
  | 'EntityID'
  | 'RecordID'
  | 'CommunicationPreferenceID'
  | 'CommunicationSenderID'
  | 'State'
  | 'ConfirmedAt'
  | 'ConfirmationToken'
  | 'ConsentSource'
  | 'ConsentAt'
  | 'CommunicationLogID'
  | 'IPAddress'
  | 'UserAgent'
>;
type SuppressionRow = Pick<
  MJCommunicationSuppressionEntity,
  | 'CommunicationEndpointID'
  | 'EntityID'
  | 'RecordID'
  | 'CommunicationSenderID'
  | 'CommunicationPreferenceID'
  | 'Reason'
  | 'Source'
  | 'Status'
  | 'EffectiveAt'
  | 'CommunicationLogID'
>;
interface AuditRow {
  CommunicationPrincipalPreferenceID?: string | null;
  CommunicationSuppressionID?: string | null;
  CommunicationLogID?: string | null;
  Action?: string;
  PreviousValue?: string | null;
  NewValue?: string | null;
  Source?: string;
  IPAddress?: string | null;
  UserAgent?: string | null;
}

const sameID = (a: string | null | undefined, b: string | null | undefined): boolean => a != null && b != null && a.toLowerCase() === b.toLowerCase();

/** The comms tables the default functions read and write, with the predicates of the filters they issue. */
class CommsDb {
  public Logs: LogRow[] = [];
  public Senders: SenderRow[] = [];
  public EndpointPrincipals: EndpointPrincipalRow[] = [];
  public Preferences: PreferenceRow[] = [];
  public PrincipalPreferences: Array<FakeEntity<PrincipalPreferenceRow>> = [];
  public Suppressions: Array<FakeEntity<SuppressionRow>> = [];
  public AuditLogs: Array<FakeEntity<AuditRow>> = [];
  /** How newly created rows of an entity answer `Save()`. */
  public NewRowBehaviour = new Map<string, Partial<FakeEntityBehaviour>>();

  public AddPrincipalPreference(
    row: Partial<PrincipalPreferenceRow> & Pick<PrincipalPreferenceRow, 'CommunicationPreferenceID' | 'State'>,
    behaviour: Partial<FakeEntityBehaviour> = {},
  ): FakeEntity<PrincipalPreferenceRow> {
    const entity = MakeFakeEntity<PrincipalPreferenceRow>(
      {
        EntityID: CONTACTS_ENTITY_ID,
        RecordID: 'contact-7',
        CommunicationSenderID: null,
        ConfirmedAt: null,
        ConfirmationToken: null,
        ConsentSource: 'Signup Form',
        ConsentAt: new Date('2026-01-01T00:00:00.000Z'),
        CommunicationLogID: null,
        IPAddress: null,
        UserAgent: null,
        ...row,
      },
      behaviour,
    );
    entity.ID = `pp-${this.PrincipalPreferences.length + 1}`;
    this.PrincipalPreferences.push(entity);
    return entity;
  }

  public AddSuppression(row: Partial<SuppressionRow>): FakeEntity<SuppressionRow> {
    const entity = MakeFakeEntity<SuppressionRow>({
      CommunicationEndpointID: 'ep-1',
      EntityID: null,
      RecordID: null,
      CommunicationSenderID: null,
      CommunicationPreferenceID: null,
      Reason: 'User Unsubscribe',
      Source: 'One-Click Header',
      Status: 'Active',
      EffectiveAt: new Date('2026-06-01T00:00:00.000Z'),
      CommunicationLogID: null,
      ...row,
    });
    entity.ID = `supp-${this.Suppressions.length + 1}`;
    this.Suppressions.push(entity);
    return entity;
  }

  /** Wires the tables into the view double and the provider double. */
  public Install(views: FakeViews, provider: FakeMetadataProvider): void {
    views.Serve('MJ: Communication Logs', (p) => this.selectLogs(p));
    views.Serve('MJ: Communication Endpoint Principals', (p) =>
      this.EndpointPrincipals.filter((r) => sameID(r.CommunicationEndpointID, FilterValue(p, 'CommunicationEndpointID'))),
    );
    views.Serve('MJ: Communication Preferences', (p) => this.selectPreferences(p));
    views.Serve('MJ: Communication Principal Preferences', (p) => this.selectPrincipalPreferences(p));
    views.Serve('MJ: Communication Suppressions', (p) => this.selectSuppressions(p));

    provider.Provide('MJ: Communication Senders', () => {
      const sender = MakeFakeEntity<Partial<SenderRow>>({});
      sender.Load = async (id: string) => {
        sender.LoadCalls.push(id);
        const row = this.Senders.find((s) => sameID(s.ID, id));
        if (row) Object.assign(sender, row);
        return Boolean(row);
      };
      return sender;
    });
    provider.Provide('MJ: Communication Principal Preferences', () =>
      MakeFakeEntity<Partial<PrincipalPreferenceRow>>({}, this.NewRowBehaviour.get('MJ: Communication Principal Preferences'), (saved) => {
        const row = saved as FakeEntity<PrincipalPreferenceRow>;
        if (!this.PrincipalPreferences.includes(row)) this.PrincipalPreferences.push(row);
      }),
    );
    provider.Provide('MJ: Communication Suppressions', () =>
      MakeFakeEntity<Partial<SuppressionRow>>({}, this.NewRowBehaviour.get('MJ: Communication Suppressions'), (saved) => {
        this.Suppressions.push(saved as FakeEntity<SuppressionRow>);
      }),
    );
    provider.Provide('MJ: Communication Consent Audit Logs', () =>
      MakeFakeEntity<AuditRow>({}, this.NewRowBehaviour.get('MJ: Communication Consent Audit Logs'), (saved) => {
        this.AuditLogs.push(saved);
      }),
    );
  }

  private selectLogs(p: RunViewParams): LogRow[] {
    const unsubscribe = FilterValue(p, 'UnsubscribeToken');
    const tracking = FilterValue(p, 'TrackingToken');
    return this.Logs.filter(
      (l) => (unsubscribe !== undefined && l.UnsubscribeToken === unsubscribe) || (tracking !== undefined && l.TrackingToken === tracking),
    );
  }

  private selectPreferences(p: RunViewParams): PreferenceRow[] {
    const senderID = FilterValue(p, 'CommunicationSenderID');
    return this.Preferences.filter(
      (r) => r.Status === 'Active' && r.IsUserVisible && (r.CommunicationSenderID === null || sameID(r.CommunicationSenderID, senderID)),
    ).sort((a, b) => a.DisplayOrder - b.DisplayOrder || a.Name.localeCompare(b.Name));
  }

  private selectPrincipalPreferences(p: RunViewParams): Array<FakeEntity<PrincipalPreferenceRow>> {
    const confirmationToken = FilterValue(p, 'ConfirmationToken');
    if (confirmationToken !== undefined) {
      return this.PrincipalPreferences.filter((r) => r.ConfirmationToken === confirmationToken);
    }
    const preferenceID = FilterValue(p, 'CommunicationPreferenceID');
    const senderID = FilterValue(p, 'CommunicationSenderID');
    const nullSenderOnly = FilterText(p).includes('CommunicationSenderID IS NULL');
    return this.PrincipalPreferences.filter(
      (r) =>
        sameID(r.EntityID, FilterValue(p, 'EntityID')) &&
        r.RecordID === FilterValue(p, 'RecordID') &&
        (preferenceID === undefined || sameID(r.CommunicationPreferenceID, preferenceID)) &&
        (senderID === undefined || sameID(r.CommunicationSenderID, senderID)) &&
        (!nullSenderOnly || r.CommunicationSenderID === null),
    );
  }

  private selectSuppressions(p: RunViewParams): Array<FakeEntity<SuppressionRow>> {
    const endpointID = FilterValue(p, 'CommunicationEndpointID');
    const entityID = FilterValue(p, 'EntityID');
    const recordID = FilterValue(p, 'RecordID');
    return this.Suppressions.filter(
      (r) =>
        r.Status === 'Active' &&
        r.Reason === 'User Unsubscribe' &&
        r.CommunicationPreferenceID === null &&
        (sameID(r.CommunicationEndpointID, endpointID) || (sameID(r.EntityID, entityID) && r.RecordID === recordID && recordID !== undefined)),
    );
  }
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SYSTEM_USER: UserInfo = MakeUser({ ID: 'user-system', Name: 'System', Email: 'not.set@nowhere.com', Type: 'Owner          ' });
const CONTACTS_ENTITY_ID = 'E0000000-0000-4000-8000-0000000000C1';
const UNSUB_TOKEN = '550e8400-e29b-41d4-a716-446655440000';
const TRACK_TOKEN = '22222222-3333-4444-8555-666666666666';
const UNKNOWN_TOKEN = '99999999-8888-4777-8666-555555555555';
const CONFIRM_TOKEN = '11111111-2222-4333-8444-555555555555';
const HMAC_SECRET = 'defaults-test-hmac-secret-32-chars';

const views: FakeViews = CommsFakes.Views;
let db: CommsDb;
let provider: FakeMetadataProvider;

const NEWSLETTER: PreferenceRow = {
  ID: 'pref-news',
  CommunicationSenderID: null,
  Name: 'Newsletter',
  Description: 'Monthly news',
  Category: 'News',
  MessageClass: 'Marketing',
  DefaultState: 'Opted In',
  IsUserVisible: true,
  DisplayOrder: 1,
  Status: 'Active',
};
const OFFERS: PreferenceRow = {
  ID: 'pref-offers',
  CommunicationSenderID: 'sender-1',
  Name: 'Offers',
  Description: null,
  Category: null,
  MessageClass: 'Marketing',
  DefaultState: 'Opted Out',
  IsUserVisible: true,
  DisplayOrder: 2,
  Status: 'Active',
};

/** A sent message to contact-7 from sender-1, with two visible preferences. */
function seedSentMessage(log: Partial<LogRow> = {}): void {
  db.Logs.push({
    ID: 'log-1',
    UnsubscribeToken: UNSUB_TOKEN,
    TrackingToken: TRACK_TOKEN,
    EntityID: CONTACTS_ENTITY_ID,
    RecordID: 'contact-7',
    CommunicationEndpointID: 'ep-1',
    CommunicationSenderID: 'sender-1',
    ...log,
  });
  db.Senders.push({ ID: 'sender-1', Name: 'Acme News', PreferenceCenterURL: null, TemplateContext: null });
  db.Preferences.push(
    NEWSLETTER,
    OFFERS,
    { ...NEWSLETTER, ID: 'pref-hidden', Name: 'Internal', IsUserVisible: false },
    { ...NEWSLETTER, ID: 'pref-disabled', Name: 'Retired', Status: 'Disabled' },
    { ...NEWSLETTER, ID: 'pref-other-sender', Name: 'Other sender topic', CommunicationSenderID: 'sender-2' },
  );
}

async function withServer(options: CommsWebhookHandlerOptions, fn: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = express();
  app.use('/comms', CreateCommsWebhookHandler(options));
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const { port } = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${port}/comms`);
  } finally {
    server.close();
  }
}

/** Calls the router with no overrides at all, so every `default*` function is the real one. */
const withDefaults = (fn: (baseUrl: string) => Promise<void>): Promise<void> => withServer({ HmacSecret: HMAC_SECRET }, fn);

const published = (): CommsActivityWorkPayload[] => state.publishCalls.flatMap((call) => call.Requests.map((r) => r.Payload as CommsActivityWorkPayload));
const rejected = (code: string, message: string): PublishResult => ({
  MessageID: 'msg-1',
  Status: 'Rejected',
  Error: { Code: code, Message: message, Retryable: true },
});

const getJson = (url: string) => fetch(url, { headers: { Accept: 'application/json' } });
const postJson = (url: string, body: object) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'vitest-agent' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  views.Reset();
  db = new CommsDb();
  provider = new FakeMetadataProvider('global-comms-provider');
  db.Install(views, provider);
  vi.spyOn(CommunicationEngineBase.Instance, 'ProviderToUse', 'get').mockReturnValue(provider.AsProvider());
  state.systemUser = SYSTEM_USER;
  state.systemUserError = undefined;
  state.credentials = [];
  state.credentialRequests = [];
  state.resolveCredential = undefined;
  state.topics = [{ Name: 'comms.activity' }];
  state.queueConfig = [];
  state.publishCalls = [];
  state.publishImpl = undefined;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ─── SendGrid webhook: key lookup, signature, replay, chunking ───────────────

describe('POST /webhooks/sendgrid with the default key lookup and queue publish', () => {
  const NOW_SEC = 1_700_000_000;
  let publicKeyPem: string;
  let privateKeyPem: string;

  beforeEach(() => {
    const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  });

  function sign(rawBody: string, tsSec = NOW_SEC): Record<string, string> {
    const timestamp = String(tsSec);
    const signer = crypto.createSign('SHA256');
    signer.update(timestamp);
    signer.update(rawBody);
    signer.end();
    return {
      'Content-Type': 'application/json',
      'x-twilio-email-event-webhook-signature': signer.sign(privateKeyPem, 'base64'),
      'x-twilio-email-event-webhook-timestamp': timestamp,
    };
  }

  const withWebhook = (fn: (baseUrl: string) => Promise<void>) => withServer({ NowSeconds: () => NOW_SEC }, fn);
  const BODY = JSON.stringify([{ event: 'delivered', email: 'a@example.com', sg_event_id: 'evt-1' }]);

  it('verifies with the environment key on the credential-less route and publishes the raw body', async () => {
    vi.stubEnv('COMMUNICATION_VENDOR_WEBHOOK_KEY__SENDGRID', publicKeyPem);

    await withWebhook(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/webhooks/sendgrid`, { method: 'POST', headers: sign(BODY), body: BODY });

      expect(res.status).toBe(202);
      expect(state.publishCalls).toHaveLength(1);
      expect(state.publishCalls[0].Topic).toBe('comms.activity');
      expect(published()[0]).toMatchObject({ Source: 'sendgrid-webhook', RawBody: BODY, OccurredAt: new Date(NOW_SEC * 1000).toISOString() });
      expect(published()[0].CredentialID).toBeUndefined();
      expect(published()[0].SignatureVerifiedAtIngress).toBeUndefined();
      expect(published()[0].Headers?.['x-twilio-email-event-webhook-timestamp']).toBe(String(NOW_SEC));
    });
  });

  it('answers 401 and publishes nothing when no environment key is configured', async () => {
    vi.stubEnv('COMMUNICATION_VENDOR_WEBHOOK_KEY__SENDGRID', '');

    await withWebhook(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/webhooks/sendgrid`, { method: 'POST', headers: sign(BODY), body: BODY });

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Webhook verification key not configured' });
      expect(state.publishCalls).toHaveLength(0);
    });
  });

  it.each(['webhookVerificationKey', 'verificationKey', 'publicKey'])(
    "resolves the key from the SendGrid credential's %s value, as the system user",
    async (field) => {
      state.credentials = [{ ID: 'cred-sg', Name: 'SendGrid Events', CredentialType: 'SendGrid' }];
      state.resolveCredential = () => ({ values: { [field]: publicKeyPem } });

      await withWebhook(async (baseUrl) => {
        const res = await fetch(`${baseUrl}/webhooks/sendgrid/cred-sg`, { method: 'POST', headers: sign(BODY), body: BODY });

        expect(res.status).toBe(202);
        expect(state.credentialRequests).toEqual([{ Name: 'SendGrid Events', ContextUser: SYSTEM_USER, Subsystem: 'CommsWebhook' }]);
        expect(published()[0].CredentialID).toBe('cred-sg');
      });
    },
  );

  it('answers 401 for an unknown credential ID, without falling back to the environment key', async () => {
    vi.stubEnv('COMMUNICATION_VENDOR_WEBHOOK_KEY__SENDGRID', publicKeyPem);

    await withWebhook(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/webhooks/sendgrid/cred-unknown`, { method: 'POST', headers: sign(BODY), body: BODY });

      expect(res.status).toBe(401);
      expect(state.publishCalls).toHaveLength(0);
    });
  });

  it('answers 401 for a credential that is not a SendGrid credential, without reading its values', async () => {
    state.credentials = [{ ID: 'cred-twilio', Name: 'Twilio SMS', CredentialType: 'Twilio' }];
    state.resolveCredential = () => ({ values: { publicKey: publicKeyPem } });

    await withWebhook(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/webhooks/sendgrid/cred-twilio`, { method: 'POST', headers: sign(BODY), body: BODY });

      expect(res.status).toBe(401);
      expect(state.credentialRequests).toHaveLength(0);
      expect(state.publishCalls).toHaveLength(0);
    });
  });

  it('answers 401 when the credential holds no verification key', async () => {
    state.credentials = [{ ID: 'cred-sg', Name: 'SendGrid Events', CredentialType: 'SendGrid' }];
    state.resolveCredential = () => ({ values: { apiKey: 'SG.send-only' } });

    await withWebhook(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/webhooks/sendgrid/cred-sg`, { method: 'POST', headers: sign(BODY), body: BODY });

      expect(res.status).toBe(401);
      expect(state.publishCalls).toHaveLength(0);
    });
  });

  it.each([
    [
      'the user cache has no system user',
      () => {
        state.systemUser = undefined;
      },
    ],
    [
      'the user cache throws',
      () => {
        state.systemUserError = new Error('UserCache not loaded');
      },
    ],
  ])('answers 401 for a credential route when %s', async (_label, arrange) => {
    state.credentials = [{ ID: 'cred-sg', Name: 'SendGrid Events', CredentialType: 'SendGrid' }];
    state.resolveCredential = () => ({ values: { publicKey: publicKeyPem } });
    arrange();

    await withWebhook(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/webhooks/sendgrid/cred-sg`, { method: 'POST', headers: sign(BODY), body: BODY });

      expect(res.status).toBe(401);
      expect(state.credentialRequests).toHaveLength(0);
      expect(state.publishCalls).toHaveLength(0);
    });
  });

  it('answers a 5xx and publishes nothing when reading the credential throws', async () => {
    state.credentials = [{ ID: 'cred-sg', Name: 'SendGrid Events', CredentialType: 'SendGrid' }];
    state.resolveCredential = () => {
      throw new Error('Credential "SendGrid Events" has expired');
    };

    await withWebhook(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/webhooks/sendgrid/cred-sg`, { method: 'POST', headers: sign(BODY), body: BODY });

      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(state.publishCalls).toHaveLength(0);
    });
  });

  describe('with a configured key', () => {
    beforeEach(() => {
      vi.stubEnv('COMMUNICATION_VENDOR_WEBHOOK_KEY__SENDGRID', publicKeyPem);
    });

    const post = (baseUrl: string, body: string, headers: Record<string, string>) => fetch(`${baseUrl}/webhooks/sendgrid`, { method: 'POST', headers, body });

    it('rejects a body that was changed after signing', async () => {
      await withWebhook(async (baseUrl) => {
        const res = await post(baseUrl, BODY.replace('a@example.com', 'x@example.com'), sign(BODY));

        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: 'ECDSA signature mismatch' });
        expect(state.publishCalls).toHaveLength(0);
      });
    });

    it('rejects a signature made with another key', async () => {
      const other = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const headers = sign(BODY);
      const signer = crypto.createSign('SHA256');
      signer.update(String(NOW_SEC));
      signer.update(BODY);
      signer.end();
      headers['x-twilio-email-event-webhook-signature'] = signer.sign(other.privateKey, 'base64');

      await withWebhook(async (baseUrl) => {
        expect((await post(baseUrl, BODY, headers)).status).toBe(401);
        expect(state.publishCalls).toHaveLength(0);
      });
    });

    it.each([
      ['601 seconds old', NOW_SEC - 601, 401],
      ['601 seconds in the future', NOW_SEC + 601, 401],
      ['exactly 600 seconds old', NOW_SEC - 600, 202],
    ])('applies the 10-minute replay window to a validly signed body that is %s', async (_label, signedAt, expected) => {
      await withWebhook(async (baseUrl) => {
        const res = await post(baseUrl, BODY, sign(BODY, signedAt));

        expect(res.status).toBe(expected);
        expect(state.publishCalls).toHaveLength(expected === 202 ? 1 : 0);
      });
    });

    it('rejects a replayed signature whose timestamp header was moved forward', async () => {
      const headers = sign(BODY, NOW_SEC - 3600);
      headers['x-twilio-email-event-webhook-timestamp'] = String(NOW_SEC);

      await withWebhook(async (baseUrl) => {
        expect((await post(baseUrl, BODY, headers)).status).toBe(401);
      });
    });

    it.each(['x-twilio-email-event-webhook-signature', 'x-twilio-email-event-webhook-timestamp'])('rejects a request without the %s header', async (header) => {
      const headers = sign(BODY);
      delete headers[header];

      await withWebhook(async (baseUrl) => {
        const res = await post(baseUrl, BODY, headers);

        expect(res.status).toBe(401);
        expect(state.publishCalls).toHaveLength(0);
      });
    });

    it('rejects an empty body with 400', async () => {
      await withWebhook(async (baseUrl) => {
        expect((await post(baseUrl, '', sign(''))).status).toBe(400);
      });
    });

    it('rejects a validly signed body that is not a JSON array with 400', async () => {
      const body = JSON.stringify({ event: 'delivered' });

      await withWebhook(async (baseUrl) => {
        const res = await post(baseUrl, body, sign(body));

        expect(res.status).toBe(400);
        expect(state.publishCalls).toHaveLength(0);
      });
    });

    it('splits a body over 180 KB into chunks, each marked verified-at-ingress and each under the limit', async () => {
      const events = Array.from({ length: 1500 }, (_v, i) => ({
        event: 'delivered',
        email: `user${i}@example.com`,
        sg_event_id: `evt-${i}`,
        category: 'x'.repeat(200),
      }));
      const body = JSON.stringify(events);
      expect(Buffer.byteLength(body)).toBeGreaterThan(180_000);

      await withWebhook(async (baseUrl) => {
        const res = await post(baseUrl, body, sign(body));

        expect(res.status).toBe(202);
        const chunks = published();
        expect(chunks.length).toBeGreaterThan(1);
        for (const chunk of chunks) {
          expect(chunk.SignatureVerifiedAtIngress).toBe(true);
          expect(Buffer.byteLength(chunk.RawBody ?? '')).toBeLessThanOrEqual(180_000);
        }
        // Nothing lost, nothing duplicated, order kept.
        const rejoined = chunks.flatMap((c) => JSON.parse(c.RawBody ?? '[]') as Array<{ sg_event_id: string }>);
        expect(rejoined.map((e) => e.sg_event_id)).toEqual(events.map((e) => e.sg_event_id));
      });
    });

    it('publishes a single event larger than the limit as its own oversized chunk', async () => {
      const events = [
        { event: 'delivered', sg_event_id: 'small-1' },
        { event: 'delivered', sg_event_id: 'huge', blob: 'y'.repeat(190_000) },
        { event: 'delivered', sg_event_id: 'small-2' },
      ];
      const body = JSON.stringify(events);

      await withWebhook(async (baseUrl) => {
        expect((await post(baseUrl, body, sign(body))).status).toBe(202);

        const ids = published().map((c) => (JSON.parse(c.RawBody ?? '[]') as Array<{ sg_event_id: string }>).map((e) => e.sg_event_id));
        expect(ids).toEqual([['small-1'], ['huge'], ['small-2']]);
      });
    });

    it('answers 503 when the queue rejects the batch', async () => {
      state.publishImpl = async () => [rejected('TopicDisabled', 'comms.activity is disabled')];

      await withWebhook(async (baseUrl) => {
        const res = await post(baseUrl, BODY, sign(BODY));

        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({ error: 'Failed to enqueue webhook batch' });
      });
    });

    it('answers 503 when a later chunk is rejected, after earlier chunks were already published', async () => {
      // SendGrid retries the whole batch on a 503, so the chunks that were accepted are
      // delivered again; the activity worker's ProviderEventID claim is what absorbs that.
      const events = Array.from({ length: 1500 }, (_v, i) => ({ event: 'delivered', sg_event_id: `evt-${i}`, category: 'x'.repeat(200) }));
      const body = JSON.stringify(events);
      let call = 0;
      state.publishImpl = async () => (++call === 2 ? [rejected('Throttled', 'slow down')] : [{ MessageID: 'm', Status: 'Accepted' }]);

      await withWebhook(async (baseUrl) => {
        const res = await post(baseUrl, body, sign(body));

        expect(res.status).toBe(503);
        expect(state.publishCalls).toHaveLength(2);
      });
    });

    it('answers 503 when publishing throws', async () => {
      state.publishImpl = async () => {
        throw new Error('transport unavailable');
      };

      await withWebhook(async (baseUrl) => {
        expect((await post(baseUrl, BODY, sign(BODY))).status).toBe(503);
      });
    });

    it('loads the queue metadata as the system user before the first publish', async () => {
      state.topics = [];

      await withWebhook(async (baseUrl) => {
        expect((await post(baseUrl, BODY, sign(BODY))).status).toBe(202);
        expect(state.queueConfig).toEqual([{ Args: [false, SYSTEM_USER] }]);
      });
    });
  });
});

// ─── Token verification on the unsubscribe, open and click routes ────────────

describe('default token verification and publish on the tracking and unsubscribe routes', () => {
  beforeEach(() => {
    seedSentMessage();
  });

  it('POST /unsubscribe/:token publishes an Unsubscribed event for a token found on a log', async () => {
    await withDefaults(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/unsubscribe/${UNSUB_TOKEN}`, { method: 'POST', headers: { 'User-Agent': 'mail-client' } });

      expect(res.status).toBe(200);
      expect(published()).toEqual([
        expect.objectContaining({ Source: 'unsubscribe', EventType: 'Unsubscribed', UnsubscribeToken: UNSUB_TOKEN, UserAgent: 'mail-client' }),
      ]);
      const lookup = views.CallsFor('MJ: Communication Logs')[0];
      expect(lookup.Params).toMatchObject({ ExtraFilter: `UnsubscribeToken='${UNSUB_TOKEN}'`, Fields: ['ID'], MaxRows: 1, ResultType: 'simple' });
      expect(lookup.User).toBe(SYSTEM_USER);
      expect(lookup.Provider).toBe(provider);
    });
  });

  it('answers 404 and publishes nothing for a well-formed token that is on no log', async () => {
    await withDefaults(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/unsubscribe/${UNKNOWN_TOKEN}`, { method: 'POST' });

      expect(res.status).toBe(404);
      expect(state.publishCalls).toHaveLength(0);
    });
  });

  it('does not accept a tracking token as an unsubscribe token', async () => {
    await withDefaults(async (baseUrl) => {
      expect((await fetch(`${baseUrl}/unsubscribe/${TRACK_TOKEN}`, { method: 'POST' })).status).toBe(404);
      expect(state.publishCalls).toHaveLength(0);
    });
  });

  it('rejects a malformed token with 400 before any lookup', async () => {
    await withDefaults(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: "x' OR 1=1 --" }),
      });

      expect(res.status).toBe(400);
      expect(views.Calls).toHaveLength(0);
    });
  });

  it('fails closed (publishes nothing) when there is no system user to look the token up as', async () => {
    state.systemUser = undefined;

    await withDefaults(async (baseUrl) => {
      expect((await fetch(`${baseUrl}/unsubscribe/${UNSUB_TOKEN}`, { method: 'POST' })).status).toBe(404);
      expect(views.Calls).toHaveLength(0);
      expect(state.publishCalls).toHaveLength(0);
    });
  });

  it('publishes nothing when the token lookup fails', async () => {
    views.Fail('MJ: Communication Logs', 'Timeout expired');

    await withDefaults(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/unsubscribe/${UNSUB_TOKEN}`, { method: 'POST' });

      expect(res.ok).toBe(false);
      expect(state.publishCalls).toHaveLength(0);
    });
  });

  // DEFECT CommsWebhookHandler.ts, defaultVerifyToken as used by handleUnsubscribe: a failed lookup
  // (`Success: false`) is folded into "token not found", so a database error during a one-click
  // unsubscribe answers 404 "Unknown unsubscribe token". A 404 tells the mail client the request
  // is final; the unsubscribe is dropped. The publish-failure path on the same route answers 503.
  it.fails('answers 503, not 404, when the unsubscribe token lookup fails', async () => {
    views.Fail('MJ: Communication Logs', 'Timeout expired');

    await withDefaults(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/unsubscribe/${UNSUB_TOKEN}`, { method: 'POST' });

      expect(res.status).toBe(503);
    });
  });

  it.each([
    ['the queue rejects it', async () => [rejected('TopicDisabled', 'disabled')]],
    [
      'publishing throws',
      async () => {
        throw new Error('transport unavailable');
      },
    ],
  ])('answers 503 for a valid unsubscribe when %s', async (_label, publishImpl) => {
    state.publishImpl = publishImpl;

    await withDefaults(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/unsubscribe/${UNSUB_TOKEN}`, { method: 'POST' });

      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: 'Failed to process unsubscribe' });
    });
  });

  it('GET /open/:token.gif publishes an Opened event only for a tracking token found on a log', async () => {
    await withDefaults(async (baseUrl) => {
      const known = await fetch(`${baseUrl}/open/${TRACK_TOKEN}.gif`);
      const unknown = await fetch(`${baseUrl}/open/${UNKNOWN_TOKEN}.gif`);

      expect([known.status, unknown.status]).toEqual([200, 200]);
      expect(published()).toEqual([expect.objectContaining({ Source: 'open-pixel', EventType: 'Opened', TrackingToken: TRACK_TOKEN })]);
      expect(views.CallsFor('MJ: Communication Logs')[0].Params.ExtraFilter).toBe(`TrackingToken='${TRACK_TOKEN}'`);
    });
  });

  it.each([
    [
      'the token lookup fails',
      () => {
        views.Fail('MJ: Communication Logs');
      },
    ],
    [
      'the queue rejects the event',
      () => {
        state.publishImpl = async () => [rejected('Throttled', 'slow down')];
      },
    ],
    [
      'publishing throws',
      () => {
        state.publishImpl = async () => {
          throw new Error('transport unavailable');
        };
      },
    ],
  ])('GET /open/:token.gif still serves the pixel when %s', async (_label, arrange) => {
    arrange();

    await withDefaults(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/open/${TRACK_TOKEN}.gif`);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/gif');
    });
  });

  it('GET /click/:token publishes a Clicked event for a known token and redirects', async () => {
    const target = 'https://example.com/landing';
    const sig = SignClickTrackingUrl(HMAC_SECRET, TRACK_TOKEN, target);

    await withDefaults(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/click/${TRACK_TOKEN}?u=${encodeURIComponent(target)}&sig=${sig}`, { redirect: 'manual' });

      expect(res.status).toBe(302);
      expect(published()).toEqual([expect.objectContaining({ Source: 'click-redirect', EventType: 'Clicked', TrackingToken: TRACK_TOKEN, TargetURL: target })]);
    });
  });

  it.each([
    ['the token is on no log', UNKNOWN_TOKEN, () => undefined],
    [
      'the token lookup fails',
      TRACK_TOKEN,
      () => {
        views.Fail('MJ: Communication Logs');
      },
    ],
    [
      'the queue rejects the event',
      TRACK_TOKEN,
      () => {
        state.publishImpl = async () => [rejected('Throttled', 'slow down')];
      },
    ],
  ])('GET /click/:token still redirects a correctly signed link when %s', async (_label, token, arrange) => {
    const target = 'https://example.com/landing';
    const sig = SignClickTrackingUrl(HMAC_SECRET, token, target);
    arrange();

    await withDefaults(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/click/${token}?u=${encodeURIComponent(target)}&sig=${sig}`, { redirect: 'manual' });

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(target);
    });
  });

  it('GET /click/:token rejects every link when no HMAC secret is configured', async () => {
    vi.stubEnv('MJ_COMMS_HMAC_SECRET', '');
    const target = 'https://example.com/landing';
    const sig = SignClickTrackingUrl(HMAC_SECRET, TRACK_TOKEN, target);

    await withServer({}, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/click/${TRACK_TOKEN}?u=${encodeURIComponent(target)}&sig=${sig}`, { redirect: 'manual' });

      expect(res.status).toBe(400);
      expect(state.publishCalls).toHaveLength(0);
    });
  });

  it('reads the HMAC secret from MJ_COMMS_HMAC_SECRET when none is passed', async () => {
    vi.stubEnv('MJ_COMMS_HMAC_SECRET', 'env-hmac-secret-32-characters-long');
    const target = 'https://example.com/landing';
    const sig = SignClickTrackingUrl('env-hmac-secret-32-characters-long', TRACK_TOKEN, target);

    await withServer({}, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/click/${TRACK_TOKEN}?u=${encodeURIComponent(target)}&sig=${sig}`, { redirect: 'manual' });

      expect(res.status).toBe(302);
    });
  });
});

// ─── Rate limiting ───────────────────────────────────────────────────────────

describe('per-route rate limiters', () => {
  beforeEach(() => {
    seedSentMessage();
  });

  it('limits each route group on its own budget', async () => {
    await withServer({ HmacSecret: HMAC_SECRET, RateLimit: { enabled: true, windowMs: 60_000, maxRequests: 1 } }, async (baseUrl) => {
      expect((await fetch(`${baseUrl}/open/${TRACK_TOKEN}.gif`)).status).toBe(200);
      expect((await fetch(`${baseUrl}/open/${TRACK_TOKEN}.gif`)).status).toBe(429);
      // The tracking budget is spent; unsubscribe and webhook budgets are untouched.
      expect((await fetch(`${baseUrl}/unsubscribe/${UNSUB_TOKEN}`, { method: 'POST' })).status).toBe(200);
      expect((await fetch(`${baseUrl}/unsubscribe/${UNSUB_TOKEN}`, { method: 'POST' })).status).toBe(429);
      expect((await fetch(`${baseUrl}/webhooks/sendgrid`, { method: 'POST', body: '[]' })).status).not.toBe(429);
      expect((await fetch(`${baseUrl}/webhooks/sendgrid`, { method: 'POST', body: '[]' })).status).toBe(429);
    });
  });

  it('lets a route-specific limit override the shared fallback', async () => {
    await withServer(
      {
        HmacSecret: HMAC_SECRET,
        RateLimit: { enabled: true, windowMs: 60_000, maxRequests: 1 },
        TrackingRateLimit: { enabled: true, windowMs: 60_000, maxRequests: 3 },
        UnsubscribeRateLimit: { enabled: false },
      },
      async (baseUrl) => {
        const opens = [];
        for (let i = 0; i < 4; i++) opens.push((await fetch(`${baseUrl}/open/${TRACK_TOKEN}.gif`)).status);
        const unsubscribes = [];
        for (let i = 0; i < 3; i++) unsubscribes.push((await fetch(`${baseUrl}/unsubscribe/${UNSUB_TOKEN}`, { method: 'POST' })).status);

        expect(opens).toEqual([200, 200, 200, 429]);
        expect(unsubscribes).toEqual([200, 200, 200]);
      },
    );
  });

  it('rate-limits the preference and confirm routes on the unsubscribe budget, before any database read', async () => {
    await withServer({ UnsubscribeRateLimit: { enabled: true, windowMs: 60_000, maxRequests: 1 } }, async (baseUrl) => {
      expect((await getJson(`${baseUrl}/preferences/${UNSUB_TOKEN}`)).status).toBe(200);
      const viewCalls = views.Calls.length;

      expect((await postJson(`${baseUrl}/preferences/${UNSUB_TOKEN}`, { UnsubscribeAll: true })).status).toBe(429);
      expect((await postJson(`${baseUrl}/confirm/${CONFIRM_TOKEN}`, {})).status).toBe(429);
      expect(views.Calls.length).toBe(viewCalls);
      expect(db.Suppressions).toHaveLength(0);
    });
  });
});

// ─── Preference center: read ─────────────────────────────────────────────────

describe('GET /preferences/:token with the default resolver', () => {
  const read = async (baseUrl: string, token = UNSUB_TOKEN): Promise<{ status: number; data: PreferenceCenterData }> => {
    const res = await getJson(`${baseUrl}/preferences/${token}`);
    return { status: res.status, data: (await res.json()) as PreferenceCenterData };
  };
  const states = (data: PreferenceCenterData): Record<string, string> => Object.fromEntries(data.Preferences.map((p) => [p.ID, p.State]));

  it('returns the sender and the visible, active preferences for that sender, in display order, with default states', async () => {
    seedSentMessage();

    await withDefaults(async (baseUrl) => {
      const { status, data } = await read(baseUrl);

      expect(status).toBe(200);
      expect(data.Token).toBe(UNSUB_TOKEN);
      expect(data.Sender).toEqual({ ID: 'sender-1', Name: 'Acme News', TemplateContext: {} });
      expect(data.Preferences).toEqual([
        { ID: 'pref-news', Name: 'Newsletter', Description: 'Monthly news', Category: 'News', MessageClass: 'Marketing', State: 'Opted In' },
        { ID: 'pref-offers', Name: 'Offers', Description: null, Category: null, MessageClass: 'Marketing', State: 'Opted Out' },
      ]);
      expect(views.Calls.every((c) => c.User === SYSTEM_USER && c.Provider === provider)).toBe(true);
    });
  });

  it("exposes only the whitelisted string keys of the sender's TemplateContext", async () => {
    seedSentMessage();
    db.Senders[0].TemplateContext = JSON.stringify({
      BrandName: 'Acme',
      PrimaryColor: '#0B5394',
      LogoURL: 42,
      InternalApiKey: 'SG.secret',
      Nested: { a: 1 },
    });

    await withDefaults(async (baseUrl) => {
      expect((await read(baseUrl)).data.Sender.TemplateContext).toEqual({ BrandName: 'Acme', PrimaryColor: '#0B5394' });
    });
  });

  it.each(['not json', '[1,2]', '"text"'])('returns an empty TemplateContext when the stored value is %s', async (raw) => {
    seedSentMessage();
    db.Senders[0].TemplateContext = raw;

    await withDefaults(async (baseUrl) => {
      expect((await read(baseUrl)).data.Sender.TemplateContext).toEqual({});
    });
  });

  it("shows the recipient's own choice, preferring a sender-specific row over a global one", async () => {
    seedSentMessage();
    db.AddPrincipalPreference({ CommunicationPreferenceID: 'pref-news', State: 'Opted Out' });
    db.AddPrincipalPreference({ CommunicationPreferenceID: 'pref-offers', State: 'Opted Out' });
    db.AddPrincipalPreference({ CommunicationPreferenceID: 'pref-offers', State: 'Opted In', CommunicationSenderID: 'sender-1' });
    db.AddPrincipalPreference({ CommunicationPreferenceID: 'pref-news', State: 'Opted In', CommunicationSenderID: 'sender-2' });
    db.AddPrincipalPreference({ CommunicationPreferenceID: 'pref-news', State: 'Opted In', RecordID: 'contact-8' });

    await withDefaults(async (baseUrl) => {
      expect(states((await read(baseUrl)).data)).toEqual({ 'pref-news': 'Opted Out', 'pref-offers': 'Opted In' });
    });
  });

  it('shows everything Opted Out after a global unsubscribe, except a topic opted back into later', async () => {
    seedSentMessage();
    db.AddSuppression({ EffectiveAt: new Date('2026-06-01T00:00:00.000Z') });
    db.AddPrincipalPreference({ CommunicationPreferenceID: 'pref-news', State: 'Opted In', ConsentAt: new Date('2026-05-01T00:00:00.000Z') });
    db.AddPrincipalPreference({ CommunicationPreferenceID: 'pref-offers', State: 'Opted In', ConsentAt: new Date('2026-07-01T00:00:00.000Z') });

    await withDefaults(async (baseUrl) => {
      expect(states((await read(baseUrl)).data)).toEqual({ 'pref-news': 'Opted Out', 'pref-offers': 'Opted In' });
    });
  });

  it.each([
    ["another sender's unsubscribe", { CommunicationSenderID: 'sender-2' }],
    ['a revoked unsubscribe', { Status: 'Revoked' as const }],
    ['a hard bounce', { Reason: 'Hard Bounce' as const }],
    ['a single-topic suppression', { CommunicationPreferenceID: 'pref-offers' }],
    ["another endpoint's unsubscribe", { CommunicationEndpointID: 'ep-2' }],
  ])('does not treat %s as a global unsubscribe', async (_label, suppression) => {
    seedSentMessage();
    db.AddSuppression(suppression);

    await withDefaults(async (baseUrl) => {
      expect(states((await read(baseUrl)).data)).toEqual({ 'pref-news': 'Opted In', 'pref-offers': 'Opted Out' });
    });
  });

  it('resolves the recipient through the endpoint when the log names no record, if exactly one principal owns it', async () => {
    seedSentMessage({ EntityID: null, RecordID: null });
    db.EndpointPrincipals.push({ ID: 'epp-1', CommunicationEndpointID: 'ep-1', EntityID: CONTACTS_ENTITY_ID, RecordID: 'contact-7' });
    db.AddPrincipalPreference({ CommunicationPreferenceID: 'pref-news', State: 'Opted Out' });

    await withDefaults(async (baseUrl) => {
      expect(states((await read(baseUrl)).data)['pref-news']).toBe('Opted Out');
      expect(views.CallsFor('MJ: Communication Endpoint Principals')[0].Params.MaxRows).toBe(2);
    });
  });

  it.each([
    [
      'two principals share the endpoint (ambiguous)',
      () => {
        db.EndpointPrincipals.push(
          { ID: 'epp-1', CommunicationEndpointID: 'ep-1', EntityID: CONTACTS_ENTITY_ID, RecordID: 'contact-7' },
          { ID: 'epp-2', CommunicationEndpointID: 'ep-1', EntityID: CONTACTS_ENTITY_ID, RecordID: 'contact-8' },
        );
      },
    ],
    ['no principal owns the endpoint', () => undefined],
    [
      'the endpoint-principal view fails',
      () => {
        db.EndpointPrincipals.push({ ID: 'epp-1', CommunicationEndpointID: 'ep-1', EntityID: CONTACTS_ENTITY_ID, RecordID: 'contact-7' });
        views.Fail('MJ: Communication Endpoint Principals');
      },
    ],
  ])('attributes no personal choices when %s', async (_label, arrange) => {
    seedSentMessage({ EntityID: null, RecordID: null });
    db.AddPrincipalPreference({ CommunicationPreferenceID: 'pref-news', State: 'Opted Out' });
    arrange();

    await withDefaults(async (baseUrl) => {
      const { status, data } = await read(baseUrl);

      expect(status).toBe(200);
      expect(states(data)).toEqual({ 'pref-news': 'Opted In', 'pref-offers': 'Opted Out' });
      expect(views.CallsFor('MJ: Communication Principal Preferences')).toHaveLength(0);
    });
  });

  it("falls back to a generic sender and global topics only when the log's sender does not load", async () => {
    seedSentMessage({ CommunicationSenderID: 'sender-deleted' });

    await withDefaults(async (baseUrl) => {
      const { data } = await read(baseUrl);

      expect(data.Sender).toEqual({ ID: '', Name: 'Communications', TemplateContext: {} });
      expect(data.Preferences.map((p) => p.ID)).toEqual(['pref-news']);
    });
  });

  it.each([
    ['the token is on no log', () => undefined, UNKNOWN_TOKEN],
    [
      'the log view fails',
      () => {
        views.Fail('MJ: Communication Logs');
      },
      UNSUB_TOKEN,
    ],
    [
      'there is no system user',
      () => {
        state.systemUser = undefined;
      },
      UNSUB_TOKEN,
    ],
  ])('answers 404 when %s', async (_label, arrange, token) => {
    seedSentMessage();
    arrange();

    await withDefaults(async (baseUrl) => {
      const res = await getJson(`${baseUrl}/preferences/${token}`);

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Preference token not found' });
    });
  });

  it('rejects a malformed token with 400 before any read', async () => {
    await withDefaults(async (baseUrl) => {
      expect((await getJson(`${baseUrl}/preferences/not-a-uuid`)).status).toBe(400);
      expect(views.Calls).toHaveLength(0);
    });
  });

  it('returns an empty topic list, still 200, when the preference view fails', async () => {
    seedSentMessage();
    views.Fail('MJ: Communication Preferences');

    await withDefaults(async (baseUrl) => {
      const { status, data } = await read(baseUrl);

      expect(status).toBe(200);
      expect(data.Preferences).toEqual([]);
    });
  });

  // DEFECT CommsWebhookHandler.ts, defaultResolvePreferenceCenterData (`ppRes.Success ? ... : []` and `if (suppRes.Success)`): a failed read of the recipient's own choices, or
  // of their unsubscribe suppressions, is treated as "none", so the page shows topic defaults. A
  // recipient who opted out of everything is shown "Opted In" and is told nothing went wrong.
  it.fails("does not present default states as the recipient's choices when their choices cannot be read", async () => {
    seedSentMessage();
    db.AddPrincipalPreference({ CommunicationPreferenceID: 'pref-news', State: 'Opted Out' });
    views.Fail('MJ: Communication Principal Preferences', 'Timeout expired');

    await withDefaults(async (baseUrl) => {
      const res = await getJson(`${baseUrl}/preferences/${UNSUB_TOKEN}`);

      expect(res.status).toBeGreaterThanOrEqual(500);
    });
  });
});

// ─── Preference center: save ─────────────────────────────────────────────────

describe('POST /preferences/:token with the default save', () => {
  const save = async (baseUrl: string, body: object, token = UNSUB_TOKEN): Promise<{ status: number; result: SavePreferenceChoicesResult }> => {
    const res = await postJson(`${baseUrl}/preferences/${token}`, body);
    return { status: res.status, result: (await res.json()) as SavePreferenceChoicesResult };
  };
  const choice = (PreferenceID: string, State: 'Opted In' | 'Opted Out') => ({ PreferenceID, State });
  const stateOf = (result: SavePreferenceChoicesResult, id: string) => result.Preferences.find((p) => p.ID === id)?.State;

  beforeEach(() => {
    seedSentMessage();
  });

  it("creates the recipient's choice with its consent evidence, audits it, and returns the new state", async () => {
    await withDefaults(async (baseUrl) => {
      const { status, result } = await save(baseUrl, { Preferences: [choice('pref-news', 'Opted Out')] });

      expect(status).toBe(200);
      expect(result).toMatchObject({ Found: true, Success: true, UnsubscribedAll: false });
      expect(stateOf(result, 'pref-news')).toBe('Opted Out');
      expect(db.PrincipalPreferences).toHaveLength(1);
      expect(db.PrincipalPreferences[0]).toMatchObject({
        EntityID: CONTACTS_ENTITY_ID,
        RecordID: 'contact-7',
        CommunicationPreferenceID: 'pref-news',
        CommunicationSenderID: 'sender-1',
        State: 'Opted Out',
        ConsentSource: 'Preference Center',
        CommunicationLogID: 'log-1',
        UserAgent: 'vitest-agent',
      });
      expect(db.PrincipalPreferences[0].ConsentAt).toBeInstanceOf(Date);
      expect(db.PrincipalPreferences[0].IPAddress).toBeTruthy();
      expect(db.AuditLogs).toHaveLength(1);
      expect(db.AuditLogs[0]).toMatchObject({
        CommunicationPrincipalPreferenceID: db.PrincipalPreferences[0].ID,
        Action: 'Created',
        PreviousValue: null,
        NewValue: JSON.stringify({ State: 'Opted Out' }),
        Source: 'Preference Center',
        CommunicationLogID: 'log-1',
      });
      // Public route: every entity is created as the system user.
      expect(provider.Requests.every((r) => r.User === SYSTEM_USER)).toBe(true);
    });
  });

  it('updates an existing sender-specific choice in place and audits the previous value', async () => {
    const existing = db.AddPrincipalPreference({ CommunicationPreferenceID: 'pref-offers', State: 'Opted In', CommunicationSenderID: 'sender-1' });

    await withDefaults(async (baseUrl) => {
      const { result } = await save(baseUrl, { Preferences: [choice('pref-offers', 'Opted Out')] });

      expect(result.Success).toBe(true);
      expect(db.PrincipalPreferences).toHaveLength(1);
      expect(existing).toMatchObject({ State: 'Opted Out', SaveCalls: 1 });
      expect(db.AuditLogs[0]).toMatchObject({
        Action: 'Updated',
        PreviousValue: JSON.stringify({ State: 'Opted In' }),
        NewValue: JSON.stringify({ State: 'Opted Out' }),
      });
    });
  });

  it('writes nothing for a choice that matches the current state', async () => {
    await withDefaults(async (baseUrl) => {
      const { status, result } = await save(baseUrl, { Preferences: [choice('pref-news', 'Opted In'), choice('pref-offers', 'Opted Out')] });

      expect(status).toBe(200);
      expect(result.Success).toBe(true);
      expect(db.PrincipalPreferences).toHaveLength(0);
      expect(db.AuditLogs).toHaveLength(0);
    });
  });

  it.each(['pref-hidden', 'pref-disabled', 'pref-other-sender', 'pref-does-not-exist'])(
    'ignores a choice for %s, a topic the page did not offer',
    async (preferenceID) => {
      await withDefaults(async (baseUrl) => {
        const { status } = await save(baseUrl, { Preferences: [choice(preferenceID, 'Opted Out')] });

        expect(status).toBe(200);
        expect(db.PrincipalPreferences).toHaveLength(0);
        expect(db.AuditLogs).toHaveLength(0);
      });
    },
  );

  it('rejects a body with neither choices nor UnsubscribeAll, and choices with an invalid state', async () => {
    await withDefaults(async (baseUrl) => {
      expect((await save(baseUrl, {})).status).toBe(400);
      expect((await save(baseUrl, { Preferences: [{ PreferenceID: 'pref-news', State: 'Pending' }] })).status).toBe(400);
      expect((await save(baseUrl, { UnsubscribeAll: 'true' })).status).toBe(400);
      expect(views.Calls).toHaveLength(0);
    });
  });

  it.each([
    ['the token is on no log', () => undefined, UNKNOWN_TOKEN],
    [
      'the log view fails',
      () => {
        views.Fail('MJ: Communication Logs');
      },
      UNSUB_TOKEN,
    ],
    [
      'there is no system user',
      () => {
        state.systemUser = undefined;
      },
      UNSUB_TOKEN,
    ],
  ])('answers 404 and writes nothing when %s', async (_label, arrange, token) => {
    arrange();

    await withDefaults(async (baseUrl) => {
      const res = await postJson(`${baseUrl}/preferences/${token}`, { UnsubscribeAll: true });

      expect(res.status).toBe(404);
      expect(db.Suppressions).toHaveLength(0);
      expect(provider.Requests.filter((r) => r.EntityName !== 'MJ: Communication Senders')).toHaveLength(0);
    });
  });

  describe('when the address does not map to one recipient', () => {
    it.each([
      ['no principal owns the endpoint', () => undefined],
      [
        'two principals share the endpoint',
        () => {
          db.EndpointPrincipals.push(
            { ID: 'epp-1', CommunicationEndpointID: 'ep-1', EntityID: CONTACTS_ENTITY_ID, RecordID: 'contact-7' },
            { ID: 'epp-2', CommunicationEndpointID: 'ep-1', EntityID: CONTACTS_ENTITY_ID, RecordID: 'contact-8' },
          );
        },
      ],
      [
        'the endpoint-principal view fails',
        () => {
          views.Fail('MJ: Communication Endpoint Principals');
        },
      ],
      [
        'the log has no endpoint either',
        () => {
          db.Logs[0].CommunicationEndpointID = null;
        },
      ],
    ])('refuses per-topic choices with 400 and saves nothing when %s', async (_label, arrange) => {
      db.Logs[0].EntityID = null;
      db.Logs[0].RecordID = null;
      arrange();

      await withDefaults(async (baseUrl) => {
        const { status, result } = await save(baseUrl, { Preferences: [choice('pref-news', 'Opted Out')] });

        expect(status).toBe(400);
        expect(result).toMatchObject({ Found: true, Success: false, UnsubscribedAll: false });
        expect(result.ErrorMessage).toContain('does not map to a unique recipient profile');
        expect(db.PrincipalPreferences).toHaveLength(0);
        expect(db.AuditLogs).toHaveLength(0);
      });
    });

    it('still honours Unsubscribe All, as an endpoint-level suppression with no record', async () => {
      db.Logs[0].EntityID = null;
      db.Logs[0].RecordID = null;
      db.EndpointPrincipals.push(
        { ID: 'epp-1', CommunicationEndpointID: 'ep-1', EntityID: CONTACTS_ENTITY_ID, RecordID: 'contact-7' },
        { ID: 'epp-2', CommunicationEndpointID: 'ep-1', EntityID: CONTACTS_ENTITY_ID, RecordID: 'contact-8' },
      );

      await withDefaults(async (baseUrl) => {
        const { status, result } = await save(baseUrl, { UnsubscribeAll: true });

        expect(status).toBe(200);
        expect(result).toMatchObject({ Success: true, UnsubscribedAll: true });
        expect(db.Suppressions).toHaveLength(1);
        expect(db.Suppressions[0]).toMatchObject({ CommunicationEndpointID: 'ep-1', EntityID: null, RecordID: null, Reason: 'User Unsubscribe' });
        expect(db.PrincipalPreferences).toHaveLength(0);
        expect(result.Preferences.every((p) => p.State === 'Opted Out')).toBe(true);
      });
    });
  });

  describe('Unsubscribe All', () => {
    it('adds a sender-scoped suppression, audits it, and opts the recipient out of every offered topic', async () => {
      await withDefaults(async (baseUrl) => {
        const { status, result } = await save(baseUrl, { UnsubscribeAll: true });

        expect(status).toBe(200);
        expect(result).toMatchObject({ Found: true, Success: true, UnsubscribedAll: true });
        expect(result.Preferences.map((p) => p.State)).toEqual(['Opted Out', 'Opted Out']);
        expect(db.Suppressions).toHaveLength(1);
        expect(db.Suppressions[0]).toMatchObject({
          CommunicationEndpointID: 'ep-1',
          EntityID: CONTACTS_ENTITY_ID,
          RecordID: 'contact-7',
          CommunicationSenderID: 'sender-1',
          CommunicationPreferenceID: null,
          Reason: 'User Unsubscribe',
          Source: 'Preference Center',
          Status: 'Active',
          CommunicationLogID: 'log-1',
        });
        expect(db.PrincipalPreferences.map((p) => [p.CommunicationPreferenceID, p.State])).toEqual([
          ['pref-news', 'Opted Out'],
          ['pref-offers', 'Opted Out'],
        ]);
        const suppressionAudit = db.AuditLogs.find((a) => a.CommunicationSuppressionID === db.Suppressions[0].ID);
        expect(suppressionAudit).toMatchObject({
          Action: 'Created',
          NewValue: JSON.stringify({ Reason: 'User Unsubscribe', UnsubscribeAll: true }),
          Source: 'Preference Center',
          UserAgent: 'vitest-agent',
        });
        expect(db.AuditLogs).toHaveLength(3);
      });
    });

    it('answers 400 with UnsubscribedAll false, and writes nothing else, when the suppression cannot be saved', async () => {
      db.NewRowBehaviour.set('MJ: Communication Suppressions', { SaveSucceeds: false, SaveError: 'Create not permitted' });

      await withDefaults(async (baseUrl) => {
        const { status, result } = await save(baseUrl, { UnsubscribeAll: true });

        expect(status).toBe(400);
        expect(result).toMatchObject({ Found: true, Success: false, UnsubscribedAll: false });
        expect(db.Suppressions).toHaveLength(0);
        expect(db.PrincipalPreferences).toHaveLength(0);
        expect(db.AuditLogs).toHaveLength(0);
      });
    });

    // DEFECT CommsWebhookHandler.ts, defaultSavePreferenceCenterChoices (`if (!(await supp.Save()))`): the save failure is returned as a bare
    // `Success: false` with no ErrorMessage and is not logged, so neither the recipient nor an
    // operator learns why an unsubscribe was not recorded.
    it.fails('says why when the unsubscribe suppression cannot be saved', async () => {
      db.NewRowBehaviour.set('MJ: Communication Suppressions', { SaveSucceeds: false, SaveError: 'Create not permitted' });

      await withDefaults(async (baseUrl) => {
        const { result } = await save(baseUrl, { UnsubscribeAll: true });

        expect(result.ErrorMessage).toBeTruthy();
      });
    });

    it('answers 500 when an opt-out row cannot be saved, leaving the suppression already in place', async () => {
      // The suppression, its audit row and each opt-out are separate saves with no transaction.
      db.NewRowBehaviour.set('MJ: Communication Principal Preferences', { SaveSucceeds: false, SaveError: 'State is required' });

      await withDefaults(async (baseUrl) => {
        const res = await postJson(`${baseUrl}/preferences/${UNSUB_TOKEN}`, { UnsubscribeAll: true });

        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: 'Failed to save preferences' });
        expect(db.Suppressions).toHaveLength(1);
        expect(db.PrincipalPreferences).toHaveLength(0);
      });
    });

    // DEFECT CommsWebhookHandler.ts, defaultSavePreferenceCenterChoices (UnsubscribeAll branch): every Unsubscribe All inserts a new suppression
    // without looking for an active one, so a double click, a browser retry or a second visit
    // leaves several Active "User Unsubscribe" rows for the same endpoint and sender. Revoking
    // one (RevokeCommsSuppression) then leaves the recipient suppressed by the others.
    it.fails('does not add a second active suppression when Unsubscribe All is submitted twice', async () => {
      await withDefaults(async (baseUrl) => {
        await save(baseUrl, { UnsubscribeAll: true });
        await save(baseUrl, { UnsubscribeAll: true });

        expect(db.Suppressions.filter((s) => s.Status === 'Active')).toHaveLength(1);
      });
    });
  });

  describe('save failures on per-topic choices', () => {
    it('answers 500 and writes no audit row when the choice cannot be saved', async () => {
      db.NewRowBehaviour.set('MJ: Communication Principal Preferences', { SaveSucceeds: false, SaveError: 'Create not permitted' });

      await withDefaults(async (baseUrl) => {
        const res = await postJson(`${baseUrl}/preferences/${UNSUB_TOKEN}`, { Preferences: [choice('pref-news', 'Opted Out')] });

        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: 'Failed to save preferences' });
        expect(db.PrincipalPreferences).toHaveLength(0);
        expect(db.AuditLogs).toHaveLength(0);
      });
    });

    it('answers 500 when the audit row cannot be saved, although the choice itself was already saved', async () => {
      // The consent audit log is append-only evidence. Here the choice is persisted without
      // it, and the caller is told the save failed: a retry then finds the choice unchanged
      // and writes no audit row either.
      db.NewRowBehaviour.set('MJ: Communication Consent Audit Logs', { SaveSucceeds: false, SaveError: 'audit insert refused' });

      await withDefaults(async (baseUrl) => {
        const first = await postJson(`${baseUrl}/preferences/${UNSUB_TOKEN}`, { Preferences: [choice('pref-news', 'Opted Out')] });
        const retry = await postJson(`${baseUrl}/preferences/${UNSUB_TOKEN}`, { Preferences: [choice('pref-news', 'Opted Out')] });

        expect(first.status).toBe(500);
        expect(db.PrincipalPreferences.map((p) => p.State)).toEqual(['Opted Out']);
        expect(retry.status).toBe(200);
        expect(db.AuditLogs).toHaveLength(0);
      });
    });

    it('answers 500 when saving throws (an infrastructure error)', async () => {
      db.NewRowBehaviour.set('MJ: Communication Principal Preferences', { SaveThrows: new Error('connection reset') });

      await withDefaults(async (baseUrl) => {
        const res = await postJson(`${baseUrl}/preferences/${UNSUB_TOKEN}`, { Preferences: [choice('pref-news', 'Opted Out')] });

        expect(res.status).toBe(500);
      });
    });

    it('stops at the first failed choice: earlier choices in the same request stay saved', async () => {
      const offers = db.AddPrincipalPreference(
        { CommunicationPreferenceID: 'pref-offers', State: 'Opted Out', CommunicationSenderID: 'sender-1' },
        { SaveSucceeds: false, SaveError: 'row is locked' },
      );

      await withDefaults(async (baseUrl) => {
        const res = await postJson(`${baseUrl}/preferences/${UNSUB_TOKEN}`, {
          Preferences: [choice('pref-news', 'Opted Out'), choice('pref-offers', 'Opted In')],
        });

        expect(res.status).toBe(500);
        expect(db.PrincipalPreferences.find((p) => p.CommunicationPreferenceID === 'pref-news')?.State).toBe('Opted Out');
        expect(offers.SaveCalls).toBe(1);
      });
    });
  });
});

// ─── Double opt-in confirmation ──────────────────────────────────────────────

describe('POST /confirm/:token with the default confirmation', () => {
  const confirm = async (baseUrl: string, token = CONFIRM_TOKEN): Promise<{ status: number; result: ConfirmOptInResult }> => {
    const res = await postJson(`${baseUrl}/confirm/${token}`, {});
    return { status: res.status, result: (await res.json()) as ConfirmOptInResult };
  };
  const pending = (behaviour: Partial<FakeEntityBehaviour> = {}, startState: PrincipalPreferenceRow['State'] = 'Pending') =>
    db.AddPrincipalPreference(
      { CommunicationPreferenceID: 'pref-news', State: startState, ConfirmationToken: CONFIRM_TOKEN, CommunicationLogID: 'log-1' },
      behaviour,
    );

  it('moves a Pending preference to Opted In, stamps ConfirmedAt, and audits the change', async () => {
    const pref = pending();

    await withDefaults(async (baseUrl) => {
      const { status, result } = await confirm(baseUrl);

      expect(status).toBe(200);
      expect(result).toMatchObject({ Found: true, Confirmed: true, State: 'Opted In' });
      expect(result.AlreadyConfirmed).toBeUndefined();
      expect(pref).toMatchObject({ State: 'Opted In', SaveCalls: 1 });
      expect(pref.ConfirmedAt?.toISOString()).toBe(result.ConfirmedAt);
      expect(db.AuditLogs).toHaveLength(1);
      expect(db.AuditLogs[0]).toMatchObject({
        CommunicationPrincipalPreferenceID: pref.ID,
        Action: 'Confirmed',
        PreviousValue: JSON.stringify({ State: 'Pending', ConfirmedAt: null }),
        NewValue: JSON.stringify({ State: 'Opted In', ConfirmedAt: result.ConfirmedAt }),
        Source: 'Preference Center',
        CommunicationLogID: 'log-1',
        UserAgent: 'vitest-agent',
      });
      const lookup = views.CallsFor('MJ: Communication Principal Preferences')[0];
      expect(lookup.Params.ExtraFilter).toBe(`ConfirmationToken='${CONFIRM_TOKEN}'`);
      expect(lookup.User).toBe(SYSTEM_USER);
    });
  });

  it('is idempotent: a second confirmation reports AlreadyConfirmed and writes nothing', async () => {
    const pref = pending();

    await withDefaults(async (baseUrl) => {
      await confirm(baseUrl);
      const { status, result } = await confirm(baseUrl);

      expect(status).toBe(200);
      expect(result).toMatchObject({ Found: true, Confirmed: true, AlreadyConfirmed: true, State: 'Opted In' });
      expect(pref.SaveCalls).toBe(1);
      expect(db.AuditLogs).toHaveLength(1);
    });
  });

  it('refuses to confirm a preference that was opted out, with 409 and no write', async () => {
    const pref = pending({}, 'Opted Out');

    await withDefaults(async (baseUrl) => {
      const { status, result } = await confirm(baseUrl);

      expect(status).toBe(409);
      expect(result).toMatchObject({ Found: true, Confirmed: false, State: 'Opted Out', ErrorMessage: 'Cannot confirm an opted-out preference' });
      expect(pref.SaveCalls).toBe(0);
      expect(db.AuditLogs).toHaveLength(0);
    });
  });

  it.each([
    ['the token matches no preference', () => undefined],
    [
      'the preference view fails',
      () => {
        views.Fail('MJ: Communication Principal Preferences');
      },
    ],
    [
      'there is no system user',
      () => {
        state.systemUser = undefined;
      },
    ],
  ])('answers 404 and writes nothing when %s', async (_label, arrange) => {
    const pref = pending();
    if (_label === 'the token matches no preference') pref.ConfirmationToken = UNKNOWN_TOKEN;
    arrange();

    await withDefaults(async (baseUrl) => {
      const res = await postJson(`${baseUrl}/confirm/${CONFIRM_TOKEN}`, {});

      expect(res.status).toBe(404);
      expect(pref.SaveCalls).toBe(0);
    });
  });

  it('rejects a malformed token with 400 before any read', async () => {
    await withDefaults(async (baseUrl) => {
      expect((await postJson(`${baseUrl}/confirm/not-a-uuid`, {})).status).toBe(400);
      expect(views.Calls).toHaveLength(0);
    });
  });

  it('does not confirm, and returns the save error, when the preference cannot be saved', async () => {
    pending({ SaveSucceeds: false, SaveError: 'Update not permitted' });

    await withDefaults(async (baseUrl) => {
      const { result } = await confirm(baseUrl);

      expect(result).toEqual({ Found: true, Confirmed: false, ErrorMessage: 'Update not permitted' });
      expect(db.AuditLogs).toHaveLength(0);
    });
  });

  // DEFECT CommsWebhookHandler.ts, handlePostConfirm (`if (!result.Confirmed)`) with defaultConfirmDoubleOptIn (`if (!(await pref.Save()))`): a failed Save is
  // returned as `Confirmed: false`, which the route answers exactly like an opted-out preference:
  // HTTP 409, and in the HTML page "This subscription cannot be confirmed because it has been
  // opted out." A server-side save failure is reported to the subscriber as their own opt-out.
  it.fails('answers a 5xx, not the opted-out 409, when the confirmation cannot be saved', async () => {
    pending({ SaveSucceeds: false, SaveError: 'Update not permitted' });

    await withDefaults(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/confirm/${CONFIRM_TOKEN}`, { method: 'POST', headers: { Accept: 'text/html' } });

      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(await res.text()).not.toContain('has been opted out');
    });
  });

  it('still confirms when only the audit row cannot be saved (the failure is logged)', async () => {
    const pref = pending();
    db.NewRowBehaviour.set('MJ: Communication Consent Audit Logs', { SaveSucceeds: false, SaveError: 'audit insert refused' });

    await withDefaults(async (baseUrl) => {
      const { status, result } = await confirm(baseUrl);

      expect(status).toBe(200);
      expect(result.Confirmed).toBe(true);
      expect(pref.State).toBe('Opted In');
      expect(db.AuditLogs).toHaveLength(0);
    });
  });

  it('GET /confirm/:token reads and writes nothing, so a link scanner cannot confirm', async () => {
    const pref = pending();

    await withDefaults(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/confirm/${CONFIRM_TOKEN}`, { headers: { Accept: 'text/html' } });

      expect(res.status).toBe(200);
      expect(views.Calls).toHaveLength(0);
      expect(pref).toMatchObject({ State: 'Pending', SaveCalls: 0 });
    });
  });
});

// ─── Unsubscribe link redirect ───────────────────────────────────────────────

describe('GET /unsubscribe/:token with the default redirect lookup', () => {
  const follow = (baseUrl: string, token = UNSUB_TOKEN) => fetch(`${baseUrl}/unsubscribe/${token}`, { redirect: 'manual' });

  beforeEach(() => {
    seedSentMessage();
  });

  it("redirects to the sender's own preference center when it has one", async () => {
    db.Senders[0].PreferenceCenterURL = 'https://prefs.acme.com/manage?brand=acme';

    await withDefaults(async (baseUrl) => {
      const res = await follow(baseUrl);

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(`https://prefs.acme.com/manage?brand=acme&token=${UNSUB_TOKEN}`);
    });
  });

  it.each([
    ['the sender has no preference center URL', () => undefined, UNSUB_TOKEN],
    [
      "the sender's URL is not http(s)",
      () => {
        db.Senders[0].PreferenceCenterURL = 'javascript:alert(1)';
      },
      UNSUB_TOKEN,
    ],
    [
      'the token is on no log',
      () => {
        db.Senders[0].PreferenceCenterURL = 'https://prefs.acme.com';
      },
      UNKNOWN_TOKEN,
    ],
    [
      'the log view fails',
      () => {
        db.Senders[0].PreferenceCenterURL = 'https://prefs.acme.com';
        views.Fail('MJ: Communication Logs');
      },
      UNSUB_TOKEN,
    ],
    [
      'there is no system user',
      () => {
        db.Senders[0].PreferenceCenterURL = 'https://prefs.acme.com';
        state.systemUser = undefined;
      },
      UNSUB_TOKEN,
    ],
  ])('redirects to the built-in preference page when %s', async (_label, arrange, token) => {
    arrange();

    await withDefaults(async (baseUrl) => {
      const res = await follow(baseUrl, token);

      expect(res.status).toBe(302);
      expect(res.headers.get('location')).toBe(`/comms/preferences/${token}`);
    });
  });
});
