import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessagePayload, RecipientSendTarget, SendingEnvelope, SendV2RecipientOutcome, SendV2Result } from '@memberjunction/communication-types';
import { CredentialEngine } from '@memberjunction/credentials';
import { V2SendService, VerifyOpenPixelSignature, VerifyTrackingSignature } from '../V2SendService';
import {
  ENTITY,
  FakeSendProvider,
  IDS,
  InstallCommsEngine,
  InstalledEngine,
  InstallOptions,
  MarketingCompliance,
  PrincipalDriverState,
  PROVIDER_NAME,
  SameID,
  SeedEndpoint,
  SeedPrincipal,
  SeedRun,
  SeedSender,
  SeedSuppression,
} from './helpers/CommsV2Harness';
import { FakeCommsDb, FakeRow } from './helpers/FakeCommsDb';

/**
 * End-to-end tests of the V2 send path: `V2SendService.Send` runs for real — sender and permission
 * resolution, the compliance gate, log claim / dedupe, compliance injection, tracking and provider
 * dispatch — against {@link FakeCommsDb} (real RunView / Save / constraint semantics) and a provider
 * fake. Nothing inside `V2SendService` is stubbed.
 */

const HTML_BODY = '<html><body><p>Hi</p><a href="https://shop.example.org/offer?a=1&amp;b=2">Offer</a></body></html>';
const PAYLOAD: MessagePayload = { Subject: 'Hello', Body: 'Hi there', HTMLBody: HTML_BODY };
const TRACKING_BASE = 'https://app.example.org';
const HMAC_SECRET = 'unit-test-hmac-secret';

type ResolvedCredentialResult = Awaited<ReturnType<typeof CredentialEngine.Instance.GetCredential>>;

let db: FakeCommsDb;
let provider: FakeSendProvider;
let service: V2SendService;
let users: InstalledEngine;
let requestedProviders: string[];

function arrange(options: InstallOptions & { Sender?: FakeRow } = {}): void {
  db = new FakeCommsDb();
  provider = new FakeSendProvider();
  service = new V2SendService();
  requestedProviders = [];
  users = InstallCommsEngine(db, options);
  SeedSender(db, options.Sender);
  // Marketing mail must be sent under a preference, so every test has one to send under.
  db.Seed(ENTITY.Preferences, {
    ID: IDS.Preference,
    Name: 'Newsletter',
    Status: 'Active',
    MessageClass: 'Marketing',
    DefaultState: 'Opted In',
    CommunicationSenderID: null,
  });
}

function envelope(messageClass: SendingEnvelope['MessageClass'], overrides: Partial<SendingEnvelope> = {}): SendingEnvelope {
  const preference = messageClass === 'Marketing' ? { PreferenceID: IDS.Preference } : {};
  return { SenderID: IDS.Sender, ChannelID: IDS.ChannelEmail, MessageClass: messageClass, ...preference, ...overrides };
}

function toAddress(address: string): RecipientSendTarget {
  return { Endpoint: { Address: address } };
}

function send(
  recipients: RecipientSendTarget[],
  sendingEnvelope: SendingEnvelope = envelope('Operational'),
  communicationRunID?: string,
): Promise<SendV2Result> {
  return service.Send(
    { Envelope: sendingEnvelope, Payload: PAYLOAD, Recipients: recipients, CommunicationRunID: communicationRunID },
    users.CallerUser,
    (name) => {
      requestedProviders.push(name);
      return provider.AsProvider();
    },
  );
}

function logs(): FakeRow[] {
  return db.Rows(ENTITY.Logs);
}

function logFor(endpoint: FakeRow): FakeRow | undefined {
  return logs().find((log) => SameID(String(log.CommunicationEndpointID), String(endpoint.ID)));
}

function outcomeFor(result: SendV2Result, address: string): SendV2RecipientOutcome | undefined {
  return result.Outcomes?.find((o) => o.Endpoint?.NormalizedValue === address);
}

function seedLog(run: FakeRow, endpoint: FakeRow, overrides: FakeRow): FakeRow {
  return db.Seed(ENTITY.Logs, {
    CommunicationRunID: run.ID,
    CommunicationEndpointID: endpoint.ID,
    CommunicationProviderID: IDS.Provider,
    CommunicationProviderMessageTypeID: IDS.ProviderMessageType,
    CommunicationSenderID: IDS.Sender,
    RecipientAddress: endpoint.NormalizedValue,
    Direction: 'Sending',
    Status: 'Pending',
    MessageDate: new Date(),
    ProviderMessageID: null,
    ErrorMessage: null,
    ...overrides,
  });
}

beforeEach(() => {
  delete process.env.MJ_COMMS_HMAC_SECRET;
  PrincipalDriverState.Reset();
  arrange();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('V2SendService.Send — allowed recipients', () => {
  it('sends to an ad-hoc address and logs it Complete with the provider message ID', async () => {
    const endpoint = SeedEndpoint(db, 'alice@example.com');

    const result = await send([toAddress('  Alice@Example.COM ')]);

    expect(result).toMatchObject({
      Success: true,
      IsAsyncRun: false,
      TotalCount: 1,
      QueuedCount: 1,
      BlockedCount: 0,
      DeferredCount: 0,
    });
    expect(requestedProviders).toEqual([PROVIDER_NAME]);
    expect(provider.Delivered).toHaveLength(1);
    const message = provider.Delivered[0];
    expect(message.To).toBe('alice@example.com');
    expect(message.From).toBe('news@example.org');
    expect(message.FromName).toBe('Example News');
    expect(message.ProcessedSubject).toBe('Hello');
    expect(message.DisableProviderTracking).toBe(true);

    expect(logs()).toHaveLength(1);
    const log = logs()[0];
    expect(log).toMatchObject({
      Status: 'Complete',
      ProviderMessageID: 'pm-1',
      RecipientAddress: 'alice@example.com',
      Direction: 'Sending',
      MessageClass: 'Operational',
      ErrorMessage: null,
    });
    expect(SameID(String(log.CommunicationEndpointID), String(endpoint.ID))).toBe(true);
    expect(SameID(String(log.CommunicationRunID), result.CommunicationRunID)).toBe(true);
    expect(SameID(message.CorrelationLogID, String(log.ID))).toBe(true);

    const outcome = outcomeFor(result, 'alice@example.com');
    expect(outcome?.Status).toBe('Sent');
    expect(SameID(outcome?.CommunicationLogID, String(log.ID))).toBe(true);

    const runs = db.Rows(ENTITY.Runs);
    expect(runs).toHaveLength(1);
    expect(runs[0].Status).toBe('Complete');
    expect(runs[0].EndedAt).toBeInstanceOf(Date);
  });

  it('sends to a principal record, stamps the log with it, and applies PreProcess/PostProcess hook output', async () => {
    const bob = SeedPrincipal(db, 'contact-1', 'bob@example.com');
    PrincipalDriverState.PreProcess = (contexts) => {
      for (const ctx of contexts) {
        ctx.AddContent('header', { html: '<p>Dear Bob</p>', text: 'Dear Bob\n' });
        ctx.SetHeader('X-Campaign', 'spring');
        ctx.SetHeader('To', 'attacker@example.net');
        ctx.RequestMutation({ Subject: 'A subject just for Bob' });
      }
    };

    const result = await send([{ Principal: bob.Ref }]);

    expect(result.QueuedCount).toBe(1);
    expect(PrincipalDriverState.PreProcessCalls).toBe(1);
    expect(PrincipalDriverState.PostProcessCalls).toBe(1);
    const message = provider.Delivered[0];
    expect(message.To).toBe('bob@example.com');
    expect(message.ProcessedSubject).toBe('A subject just for Bob');
    expect(message.ProcessedHTMLBody.startsWith('<p>Dear Bob</p>')).toBe(true);
    expect(message.ProcessedBody.startsWith('Dear Bob\n')).toBe(true);
    expect(message.Headers?.['X-Campaign']).toBe('spring');
    expect(message.Headers?.To).toBeUndefined();

    const log = logFor(bob.Endpoint);
    expect(log?.Status).toBe('Complete');
    expect(SameID(String(log?.EntityID), IDS.ContactsEntity)).toBe(true);
    expect(log?.RecordID).toBe('contact-1');
  });

  it('passes the sender credential to the provider with environment fallback disabled', async () => {
    arrange({ Sender: { CredentialID: IDS.Credential } });
    SeedEndpoint(db, 'alice@example.com');
    vi.spyOn(CredentialEngine.Instance, 'Config').mockResolvedValue(undefined);
    const resolvedCredential: ResolvedCredentialResult = {
      credential: null,
      values: { apiKey: 'sg-key' },
      source: 'database',
      expirationStatus: 'valid',
    };
    const getCredential = vi.spyOn(CredentialEngine.Instance, 'GetCredential').mockResolvedValue(resolvedCredential);

    await send([toAddress('alice@example.com')]);

    expect(getCredential).toHaveBeenCalledTimes(1);
    expect(getCredential.mock.calls[0][1]).toMatchObject({ subsystem: 'Communication' });
    expect(SameID(getCredential.mock.calls[0][1]?.credentialId, IDS.Credential)).toBe(true);
    expect(provider.Attempts[0].Credentials).toEqual({ apiKey: 'sg-key', disableEnvironmentFallback: true });
  });

  it('does not resolve credentials for a sender without a CredentialID', async () => {
    SeedEndpoint(db, 'alice@example.com');
    const getCredential = vi.spyOn(CredentialEngine.Instance, 'GetCredential');

    await send([toAddress('alice@example.com')]);

    expect(getCredential).not.toHaveBeenCalled();
    expect(provider.Attempts[0].Credentials).toBeUndefined();
  });
});

describe('V2SendService.Send — compliance gate', () => {
  it('refuses Marketing mail sent under no preference, for every recipient and whatever the enforcement mode', async () => {
    // The preference is what an opt-out, the one-click header and the preference page refer to.
    for (const mode of ['Enforce', 'Shadow', 'Off']) {
      arrange({ Sender: { EnforcementMode: mode } });
      SeedEndpoint(db, 'dave@example.com');

      const result = await send([toAddress('dave@example.com')], envelope('Marketing', { PreferenceID: undefined }));

      expect(result).toMatchObject({ TotalCount: 1, QueuedCount: 0, BlockedCount: 1 });
      expect(outcomeFor(result, 'dave@example.com')).toMatchObject({ Status: 'Blocked', Reason: 'PreferenceRequired' });
      expect(provider.Attempts).toEqual([]);
    }
  });

  it('sends Operational and Transactional mail without a preference', async () => {
    SeedEndpoint(db, 'dave@example.com');

    for (const messageClass of ['Operational', 'Transactional'] as const) {
      const result = await send([toAddress('dave@example.com')], envelope(messageClass));
      expect(outcomeFor(result, 'dave@example.com')?.Status).toBe('Sent');
    }
  });

  it('blocks a suppressed recipient without sending or logging, and still sends to the others', async () => {
    const carol = SeedEndpoint(db, 'carol@example.com');
    const dave = SeedEndpoint(db, 'dave@example.com');
    SeedSuppression(db, { CommunicationEndpointID: carol.ID, Reason: 'Admin Block' });

    const result = await send([toAddress('carol@example.com'), toAddress('dave@example.com')], envelope('Marketing'));

    expect(result).toMatchObject({ Success: true, TotalCount: 2, QueuedCount: 1, BlockedCount: 1 });
    expect(provider.Attempts.map((a) => a.Message.To)).toEqual(['dave@example.com']);
    expect(outcomeFor(result, 'carol@example.com')).toMatchObject({ Status: 'Blocked', Reason: 'Admin Block' });
    expect(outcomeFor(result, 'dave@example.com')?.Status).toBe('Sent');
    expect(logFor(carol)).toBeUndefined();
    expect(logFor(dave)?.Status).toBe('Complete');
  });

  it('ignores expired and revoked suppressions', async () => {
    const carol = SeedEndpoint(db, 'carol@example.com');
    SeedSuppression(db, { CommunicationEndpointID: carol.ID, ExpiresAt: new Date('2026-02-01T00:00:00Z') });
    SeedSuppression(db, {
      CommunicationEndpointID: carol.ID,
      Status: 'Revoked',
      RevokedAt: new Date('2026-02-01T00:00:00Z'),
    });

    const result = await send([toAddress('carol@example.com')], envelope('Marketing'));

    expect(result.BlockedCount).toBe(0);
    expect(provider.Delivered).toHaveLength(1);
  });

  it('blocks a principal suppressed by record, and a hard-bounced endpoint even for Transactional mail', async () => {
    const bob = SeedPrincipal(db, 'contact-1', 'bob@example.com');
    SeedSuppression(db, { EntityID: IDS.ContactsEntity, RecordID: 'contact-1', Reason: 'User Unsubscribe', Source: 'One-Click Header' });
    SeedEndpoint(db, 'bounced@example.com', { Status: 'Hard Bounced' });

    const marketing = await send([{ Principal: bob.Ref }], envelope('Marketing'));
    const transactional = await send([toAddress('bounced@example.com')], envelope('Transactional'));

    expect(marketing.Outcomes?.[0]).toMatchObject({ Status: 'Blocked', Reason: 'User Unsubscribe' });
    expect(transactional.Outcomes?.[0]).toMatchObject({ Status: 'Blocked', Reason: 'Hard Bounce' });
    expect(provider.Attempts).toHaveLength(0);
    expect(logs()).toHaveLength(0);
  });

  it('blocks a principal who opted out of the envelope preference', async () => {
    const bob = SeedPrincipal(db, 'contact-1', 'bob@example.com');
    db.Seed(ENTITY.PrincipalPreferences, {
      EntityID: IDS.ContactsEntity,
      RecordID: 'contact-1',
      CommunicationPreferenceID: IDS.Preference,
      CommunicationSenderID: null,
      State: 'Opted Out',
      ConsentSource: 'Preference Center',
      ConsentAt: new Date('2026-03-01T00:00:00Z'),
    });

    const result = await send([{ Principal: bob.Ref }], envelope('Marketing', { PreferenceID: IDS.Preference }));

    expect(result.Outcomes?.[0]).toMatchObject({ Status: 'Blocked', Reason: 'OptedOut' });
    expect(provider.Attempts).toHaveLength(0);
  });

  it('blocks a child sender from mailing someone who opted out under its parent sender', async () => {
    arrange({ Sender: { ParentSenderID: IDS.ParentSender } });
    SeedSender(db, { ID: IDS.ParentSender, Name: 'Parent Org', IsDefault: false });
    const bob = SeedPrincipal(db, 'contact-1', 'bob@example.com');
    db.Seed(ENTITY.PrincipalPreferences, {
      EntityID: IDS.ContactsEntity,
      RecordID: 'contact-1',
      CommunicationPreferenceID: IDS.Preference,
      CommunicationSenderID: IDS.ParentSender,
      State: 'Opted Out',
      ConsentSource: 'Preference Center',
      ConsentAt: new Date('2026-03-01T00:00:00Z'),
    });

    const result = await send([{ Principal: bob.Ref }], envelope('Marketing'));

    expect(result.Outcomes?.[0]).toMatchObject({ Status: 'Blocked', Reason: 'OptedOut' });
    expect(provider.Attempts).toHaveLength(0);
  });

  it('keeps a parent-sender opt-out in force even when the child sender has an opt-in row', async () => {
    arrange({ Sender: { ParentSenderID: IDS.ParentSender } });
    SeedSender(db, { ID: IDS.ParentSender, Name: 'Parent Org', IsDefault: false });
    const bob = SeedPrincipal(db, 'contact-1', 'bob@example.com');
    const base = {
      EntityID: IDS.ContactsEntity,
      RecordID: 'contact-1',
      CommunicationPreferenceID: IDS.Preference,
      ConsentSource: 'Preference Center',
      ConsentAt: new Date('2026-03-01T00:00:00Z'),
    };
    db.Seed(ENTITY.PrincipalPreferences, { ...base, CommunicationSenderID: IDS.ParentSender, State: 'Opted Out' });
    db.Seed(ENTITY.PrincipalPreferences, { ...base, CommunicationSenderID: IDS.Sender, State: 'Opted In' });

    const result = await send([{ Principal: bob.Ref }], envelope('Marketing'));

    expect(result.Outcomes?.[0]).toMatchObject({ Status: 'Blocked', Reason: 'OptedOut' });
    expect(provider.Attempts).toHaveLength(0);
  });

  it('blocks Marketing mail when the regime requires a postal address the sender does not have', async () => {
    arrange({ Compliance: MarketingCompliance(), Sender: { PostalAddress: null } });
    SeedEndpoint(db, 'alice@example.com');

    const result = await send([toAddress('alice@example.com')], envelope('Marketing'));

    expect(result.Outcomes?.[0]).toMatchObject({ Status: 'Blocked', Reason: 'ComplianceRegime' });
    expect(provider.Attempts).toHaveLength(0);
  });

  it('reports a recipient with no known endpoint as blocked', async () => {
    const result = await send([toAddress('stranger@example.com')]);

    expect(result).toMatchObject({ QueuedCount: 0, BlockedCount: 1 });
    expect(result.Outcomes?.[0]).toMatchObject({ Status: 'Blocked', Reason: 'NoEndpoint' });
    expect(provider.Attempts).toHaveLength(0);
  });
});

describe('V2SendService.Send — sender permissions and verified domains', () => {
  function seedParentWithGrant(roleID: string): void {
    arrange({ Sender: { ParentSenderID: IDS.ParentSender } });
    SeedSender(db, { ID: IDS.ParentSender, Name: 'Parent Org', IsDefault: false });
    db.Seed(ENTITY.SenderPermissions, {
      CommunicationSenderID: IDS.ParentSender,
      RoleID: roleID,
      UserID: null,
      PermissionLevel: 'Send',
      AppliesToChildSenders: true,
    });
    SeedEndpoint(db, 'alice@example.com');
  }

  it('allows a caller whose role holds an inherited Send grant', async () => {
    seedParentWithGrant(IDS.SendRole);

    const result = await send([toAddress('alice@example.com')]);

    expect(result.Success).toBe(true);
    expect(provider.Delivered).toHaveLength(1);
  });

  it('refuses a caller without a Send grant on the sender chain', async () => {
    seedParentWithGrant('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f');

    const result = await send([toAddress('alice@example.com')]);

    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toContain('lacks Send permission');
    expect(provider.Attempts).toHaveLength(0);
    expect(db.Rows(ENTITY.Runs)).toHaveLength(0);
  });

  it('requires a Verified sending domain when the provider demands one', async () => {
    arrange({ RequireVerifiedDomain: true });
    SeedEndpoint(db, 'alice@example.com');

    const unverified = await send([toAddress('alice@example.com')]);
    expect(unverified.Success).toBe(false);
    expect(unverified.ErrorMessage).toContain('Verified sending domain required');
    expect(provider.Attempts).toHaveLength(0);

    db.Seed(ENTITY.SendingDomains, {
      CommunicationProviderID: IDS.Provider,
      Domain: 'example.org',
      CredentialID: null,
      Status: 'Verified',
    });
    const verified = await send([toAddress('alice@example.com')]);
    expect(verified.Success).toBe(true);
    expect(provider.Delivered).toHaveLength(1);
  });
});

describe('V2SendService.Send — deferral and scheduling', () => {
  it('defers a quiet-hours recipient to a Pending log carrying the payload, without sending', async () => {
    arrange({ Compliance: MarketingCompliance({ AlwaysQuietHours: true }) });
    const erin = SeedEndpoint(db, 'erin@example.com');

    const result = await send([toAddress('erin@example.com')], envelope('Marketing'));

    expect(result).toMatchObject({ Success: true, QueuedCount: 0, DeferredCount: 1, BlockedCount: 0 });
    expect(provider.Attempts).toHaveLength(0);
    const outcome = outcomeFor(result, 'erin@example.com');
    expect(outcome?.Status).toBe('Deferred');
    expect(outcome?.DeferUntil?.getTime()).toBeGreaterThan(Date.now());

    const log = logFor(erin);
    expect(log?.Status).toBe('Pending');
    expect(log?.ScheduledAt).toEqual(outcome?.DeferUntil);
    expect(SameID(outcome?.CommunicationLogID, String(log?.ID))).toBe(true);
    // The rendered message waits in its own column; CorrelationData holds only the caller's data.
    expect(JSON.parse(String(log?.DeferredPayload))).toMatchObject({ Subject: 'Hello', Body: 'Hi there' });
    expect(log?.CorrelationData ?? null).toBeNull();
  });

  it('holds a future-scheduled send until it is due, then the sweep sends it exactly once', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
    const alice = SeedEndpoint(db, 'alice@example.com');
    const scheduledAt = new Date('2026-06-01T13:00:00Z');
    const getProvider = () => provider.AsProvider();

    const result = await send([toAddress('alice@example.com')], envelope('Operational', { ScheduledAt: scheduledAt }));
    expect(result).toMatchObject({ QueuedCount: 0, DeferredCount: 1 });
    expect(provider.Attempts).toHaveLength(0);
    expect(logFor(alice)).toMatchObject({ Status: 'Pending', ScheduledAt: scheduledAt });

    const early = await service.ProcessDueScheduledLogs(users.CallerUser, getProvider);
    expect(early.Processed).toBe(0);
    expect(provider.Attempts).toHaveLength(0);

    vi.setSystemTime(new Date('2026-06-01T13:30:00Z'));
    const due = await service.ProcessDueScheduledLogs(users.CallerUser, getProvider);
    expect(due).toEqual({ Processed: 1, Sent: 1, Failed: 0, Redeferred: 0 });
    expect(provider.Delivered).toHaveLength(1);
    expect(provider.Delivered[0].ProcessedSubject).toBe('Hello');
    expect(logs()).toHaveLength(1);
    expect(logFor(alice)).toMatchObject({ Status: 'Complete', ProviderMessageID: 'pm-1' });

    const again = await service.ProcessDueScheduledLogs(users.CallerUser, getProvider);
    expect(again.Processed).toBe(0);
    expect(provider.Attempts).toHaveLength(1);
  });

  it('re-runs the gate when a deferred log comes due, and fails it if the recipient was suppressed meanwhile', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
    const alice = SeedEndpoint(db, 'alice@example.com');
    await send([toAddress('alice@example.com')], envelope('Operational', { ScheduledAt: new Date('2026-06-01T13:00:00Z') }));
    SeedSuppression(db, { CommunicationEndpointID: alice.ID, Reason: 'Spam Complaint', Source: 'Provider Webhook' });

    vi.setSystemTime(new Date('2026-06-01T13:30:00Z'));
    const due = await service.ProcessDueScheduledLogs(users.CallerUser, () => provider.AsProvider());

    expect(due).toEqual({ Processed: 1, Sent: 0, Failed: 1, Redeferred: 0 });
    expect(provider.Attempts).toHaveLength(0);
    expect(logFor(alice)?.Status).toBe('Failed');
    expect(String(logFor(alice)?.ErrorMessage)).toContain('Spam Complaint');
  });

  it('does not report a recipient as Deferred when its Pending log could not be saved', async () => {
    SeedEndpoint(db, 'alice@example.com');
    db.FailSave(ENTITY.Logs);

    const result = await send([toAddress('alice@example.com')], envelope('Operational', { ScheduledAt: new Date(Date.now() + 3_600_000) }));

    expect(logs()).toHaveLength(0);
    expect(outcomeFor(result, 'alice@example.com')?.Status).toBe('Failed');
    expect(result.DeferredCount).toBe(0);
  });
});

describe('V2SendService.Send — idempotency and dedupe', () => {
  it('does not re-send when the same run is delivered twice', async () => {
    const alice = SeedEndpoint(db, 'alice@example.com');
    const run = SeedRun(db);

    const first = await send([toAddress('alice@example.com')], envelope('Operational'), String(run.ID));
    const second = await send([toAddress('alice@example.com')], envelope('Operational'), String(run.ID));

    expect(first.QueuedCount).toBe(1);
    expect(provider.Attempts).toHaveLength(1);
    expect(logs()).toHaveLength(1);
    expect(db.Rows(ENTITY.Runs)).toHaveLength(1);
    const outcome = outcomeFor(second, 'alice@example.com');
    expect(outcome?.Status).toBe('Sent');
    expect(SameID(outcome?.CommunicationLogID, String(logFor(alice)?.ID))).toBe(true);
  });

  it('retries a recipient whose earlier attempt Failed, reusing the same log row', async () => {
    const alice = SeedEndpoint(db, 'alice@example.com');
    const run = SeedRun(db);
    provider.DefaultBehavior = 'fail';
    await send([toAddress('alice@example.com')], envelope('Operational'), String(run.ID));
    expect(logFor(alice)).toMatchObject({ Status: 'Failed', ProviderMessageID: null });

    provider.DefaultBehavior = 'succeed';
    const retry = await send([toAddress('alice@example.com')], envelope('Operational'), String(run.ID));

    expect(retry.QueuedCount).toBe(1);
    expect(provider.Attempts).toHaveLength(2);
    expect(logs()).toHaveLength(1);
    expect(logFor(alice)).toMatchObject({ Status: 'Complete', ErrorMessage: null });
    expect(logFor(alice)?.ProviderMessageID).toBe('pm-2');
  });

  it('does not send over a log another worker already holds In-Progress', async () => {
    const alice = SeedEndpoint(db, 'alice@example.com');
    const run = SeedRun(db);
    seedLog(run, alice, { Status: 'In-Progress' });

    const result = await send([toAddress('alice@example.com')], envelope('Operational'), String(run.ID));

    expect(provider.Attempts).toHaveLength(0);
    expect(result.QueuedCount).toBe(0);
    expect(outcomeFor(result, 'alice@example.com')).toMatchObject({ Status: 'Failed', Reason: 'LogAlreadyInProgress' });
    expect(logs()).toHaveLength(1);
  });

  it('sends once when two recipients in one run share an address (unique index on run + endpoint)', async () => {
    const alice = SeedEndpoint(db, 'alice@example.com');

    const result = await send([toAddress('Alice@Example.com'), toAddress(' alice@example.com ')]);

    expect(provider.Attempts).toHaveLength(1);
    expect(logs()).toHaveLength(1);
    expect(logFor(alice)?.Status).toBe('Complete');
    expect(db.SaveAttempts.some((a) => !a.Accepted && a.Message.includes('UX_CommunicationLog_Run_Endpoint'))).toBe(true);
    expect(result.Outcomes).toHaveLength(2);
    for (const outcome of result.Outcomes ?? []) {
      expect(outcome.Status).toBe('Sent');
      expect(SameID(outcome.CommunicationLogID, String(logFor(alice)?.ID))).toBe(true);
    }
  });

  it('sends once when two principal records resolve to the same endpoint', async () => {
    const first = SeedPrincipal(db, 'contact-1', 'shared@example.com');
    const second = SeedPrincipal(db, 'contact-2', 'shared@example.com', first.Endpoint);

    const result = await send([{ Principal: first.Ref }, { Principal: second.Ref }]);

    expect(provider.Attempts).toHaveLength(1);
    expect(logs()).toHaveLength(1);
    expect(result.Outcomes?.map((o) => o.Status)).toEqual(['Sent', 'Sent']);
  });

  it('writes one Pending log when two deferred recipients share an address', async () => {
    const alice = SeedEndpoint(db, 'alice@example.com');

    const result = await send(
      [toAddress('alice@example.com'), toAddress('ALICE@example.com')],
      envelope('Operational', { ScheduledAt: new Date(Date.now() + 3_600_000) }),
    );

    expect(provider.Attempts).toHaveLength(0);
    expect(logs()).toHaveLength(1);
    expect(logFor(alice)?.Status).toBe('Pending');
    for (const outcome of result.Outcomes ?? []) {
      expect(outcome.Status).toBe('Deferred');
      expect(SameID(outcome.CommunicationLogID, String(logFor(alice)?.ID))).toBe(true);
    }
  });

  it('loses a claim race to a concurrent In-Progress writer without sending', async () => {
    SeedEndpoint(db, 'alice@example.com');
    db.OnceBeforeSave(ENTITY.Logs, (row) => {
      db.Seed(ENTITY.Logs, {
        CommunicationRunID: row.CommunicationRunID,
        CommunicationEndpointID: row.CommunicationEndpointID,
        CommunicationProviderID: IDS.Provider,
        CommunicationProviderMessageTypeID: IDS.ProviderMessageType,
        Direction: 'Sending',
        Status: 'In-Progress',
        MessageDate: new Date(),
        ProviderMessageID: null,
      });
    });

    const result = await send([toAddress('alice@example.com')]);

    expect(provider.Attempts).toHaveLength(0);
    expect(logs()).toHaveLength(1);
    expect(result.Outcomes?.[0]).toMatchObject({ Status: 'Failed', Reason: 'LogAlreadyInProgress' });
  });

  it('treats a claim race lost to a writer that already sent as Sent, without sending again', async () => {
    SeedEndpoint(db, 'alice@example.com');
    db.OnceBeforeSave(ENTITY.Logs, (row) => {
      db.Seed(ENTITY.Logs, {
        CommunicationRunID: row.CommunicationRunID,
        CommunicationEndpointID: row.CommunicationEndpointID,
        CommunicationProviderID: IDS.Provider,
        CommunicationProviderMessageTypeID: IDS.ProviderMessageType,
        Direction: 'Sending',
        Status: 'Complete',
        MessageDate: new Date(),
        ProviderMessageID: 'pm-other-worker',
      });
    });

    const result = await send([toAddress('alice@example.com')]);

    expect(provider.Attempts).toHaveLength(0);
    expect(logs()).toHaveLength(1);
    expect(result.Outcomes?.[0].Status).toBe('Sent');
  });
});

describe('V2SendService.Send — compliance injection and tracking', () => {
  function arrangeMarketing(): FakeRow {
    arrange({ Compliance: MarketingCompliance() });
    service.Configure({ BaseTrackingURL: TRACKING_BASE, TrackingHMACSecret: HMAC_SECRET });
    return SeedEndpoint(db, 'alice@example.com');
  }

  it('injects the unsubscribe header, compliance footer, signed click links and open pixel', async () => {
    const alice = arrangeMarketing();

    await send([toAddress('alice@example.com')], envelope('Marketing'));

    const message = provider.Delivered[0];
    const log = logFor(alice);
    const html = message.ProcessedHTMLBody;
    const unsubscribeUrl = `${TRACKING_BASE}/comms/unsubscribe/${String(log?.UnsubscribeToken)}`;
    expect(SameID(String(log?.UnsubscribeToken), String(log?.TrackingToken))).toBe(false);

    // One-click unsubscribe headers
    expect(message.Headers?.['List-Unsubscribe']?.toLowerCase()).toBe(`<${unsubscribeUrl}>`.toLowerCase());
    expect(message.Headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');

    // Compliance footer: postal address + a direct (untracked) unsubscribe link, in HTML and text
    expect(html).toContain('data-mj-compliance-footer="true"');
    expect(html).toContain('1 Main St, Springfield');
    expect(html.toLowerCase()).toContain(`<a href="${unsubscribeUrl}">unsubscribe</a>`.toLowerCase());
    expect(message.ProcessedBody).toContain('1 Main St, Springfield');
    expect(message.ProcessedBody.toLowerCase()).toContain(`unsubscribe: ${unsubscribeUrl}`.toLowerCase());

    // Content link is rewritten through the click endpoint with a valid signature
    expect(html).not.toContain('href="https://shop.example.org/offer');
    const click = html.match(/href="https:\/\/app\.example\.org\/comms\/click\/([0-9a-fA-F-]+)\?u=([^&"]+)&sig=([a-f0-9]+)"/);
    expect(click).not.toBeNull();
    const [, clickToken, encodedTarget, signature] = click ?? [];
    const target = decodeURIComponent(encodedTarget);
    expect(SameID(clickToken, String(log?.TrackingToken))).toBe(true);
    expect(target).toBe('https://shop.example.org/offer?a=1&b=2');
    expect(VerifyTrackingSignature(clickToken, target, signature, HMAC_SECRET)).toBe(true);

    // Open pixel carries the tracking token, never the unsubscribe token, and is signed so the
    // open route can accept it without a lookup
    const pixel = html.match(/<img src="https:\/\/app\.example\.org\/comms\/open\/([0-9a-fA-F-]+)\.gif\?sig=([a-f0-9]+)"/);
    expect(SameID(pixel?.[1], String(log?.TrackingToken))).toBe(true);
    expect(VerifyOpenPixelSignature(pixel?.[1] ?? '', pixel?.[2] ?? '', HMAC_SECRET)).toBe(true);

    const decision = JSON.parse(String(log?.ComplianceDecision));
    expect(decision.Decision).toBe('Allowed');
    expect(decision.ApplicableRegimes).toEqual(['Test CAN-SPAM']);
    expect(decision.Obligations).toMatchObject({ RequireOneClickHeader: true, RequireFooterUnsubscribe: true });
  });

  it('honours TrackClicks/TrackOpens = false but still injects the compliance footer', async () => {
    arrangeMarketing();

    await send([toAddress('alice@example.com')], envelope('Marketing', { TrackClicks: false, TrackOpens: false }));

    const html = provider.Delivered[0].ProcessedHTMLBody;
    expect(html).toContain('href="https://shop.example.org/offer?a=1&amp;b=2"');
    expect(html).not.toContain('/comms/click/');
    expect(html).not.toContain('/comms/open/');
    expect(html).toContain('data-mj-compliance-footer="true"');
  });

  it('leaves links unsigned and unrewritten when no HMAC secret is configured', async () => {
    arrange({ Compliance: MarketingCompliance() });
    service.Configure({ BaseTrackingURL: TRACKING_BASE });
    SeedEndpoint(db, 'alice@example.com');

    await send([toAddress('alice@example.com')], envelope('Marketing'));

    const html = provider.Delivered[0].ProcessedHTMLBody;
    expect(html).toContain('href="https://shop.example.org/offer?a=1&amp;b=2"');
    expect(html).not.toContain('/comms/click/');
  });

  it('adds no unsubscribe header or footer to Transactional mail', async () => {
    arrangeMarketing();

    await send([toAddress('alice@example.com')], envelope('Transactional'));

    const message = provider.Delivered[0];
    expect(message.Headers?.['List-Unsubscribe']).toBeUndefined();
    expect(message.ProcessedHTMLBody).not.toContain('data-mj-compliance-footer');
    expect(message.ProcessedBody).toBe('Hi there');
  });

  it('does not let a principal hook overwrite the protected unsubscribe headers', async () => {
    arrange({ Compliance: MarketingCompliance() });
    service.Configure({ BaseTrackingURL: TRACKING_BASE, TrackingHMACSecret: HMAC_SECRET });
    const bob = SeedPrincipal(db, 'contact-1', 'bob@example.com');
    PrincipalDriverState.PostProcess = (contexts) => {
      for (const ctx of contexts) {
        ctx.SetHeader('List-Unsubscribe', '<https://evil.example/keep-me-subscribed>');
        ctx.SetHeader('list-unsubscribe-post', 'nope');
      }
    };

    await send([{ Principal: bob.Ref }], envelope('Marketing'));

    const headers = provider.Delivered[0].Headers ?? {};
    const token = String(logFor(bob.Endpoint)?.UnsubscribeToken);
    expect(headers['List-Unsubscribe'].toLowerCase()).toBe(`<${TRACKING_BASE}/comms/unsubscribe/${token}>`.toLowerCase());
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(headers['list-unsubscribe-post']).toBeUndefined();
  });
});

describe('V2SendService.Send — provider failures', () => {
  it('records a provider-reported failure on the log and keeps sending to the other recipients', async () => {
    const alice = SeedEndpoint(db, 'alice@example.com');
    const bob = SeedEndpoint(db, 'bob@example.com');
    provider.SetBehaviorFor('alice@example.com', 'fail');

    const result = await send([toAddress('alice@example.com'), toAddress('bob@example.com')]);

    expect(result).toMatchObject({ Success: true, TotalCount: 2, QueuedCount: 1 });
    expect(outcomeFor(result, 'alice@example.com')).toMatchObject({ Status: 'Failed', Detail: '550 5.1.1 mailbox unavailable' });
    expect(outcomeFor(result, 'bob@example.com')?.Status).toBe('Sent');
    expect(logFor(alice)).toMatchObject({ Status: 'Failed', ErrorMessage: '550 5.1.1 mailbox unavailable', ProviderMessageID: null });
    expect(logFor(bob)?.Status).toBe('Complete');
    expect(db.Rows(ENTITY.Runs)[0].Status).toBe('Complete');
  });

  it('contains a provider exception to the one recipient: log Failed, others still sent', async () => {
    const alice = SeedEndpoint(db, 'alice@example.com');
    const bob = SeedEndpoint(db, 'bob@example.com');
    provider.SetBehaviorFor('alice@example.com', 'throw');

    const result = await send([toAddress('alice@example.com'), toAddress('bob@example.com')]);

    expect(outcomeFor(result, 'alice@example.com')?.Status).toBe('Failed');
    expect(logFor(alice)?.Status).toBe('Failed');
    expect(outcomeFor(result, 'bob@example.com')?.Status).toBe('Sent');
    expect(logFor(bob)?.Status).toBe('Complete');
    expect(db.Rows(ENTITY.Runs)[0].Status).toBe('Complete');
  });

  it('contains a throwing PreProcess hook to the one recipient: log Failed, others still sent', async () => {
    const first = SeedPrincipal(db, 'contact-1', 'first@example.com');
    const second = SeedPrincipal(db, 'contact-2', 'second@example.com');
    PrincipalDriverState.PreProcess = (contexts) => {
      if (contexts.some((ctx) => ctx.Principal.RecordID === 'contact-1')) {
        throw new Error('CRM lookup failed in PreProcess');
      }
    };

    const result = await send([{ Principal: first.Ref }, { Principal: second.Ref }]);

    expect(outcomeFor(result, 'first@example.com')?.Status).toBe('Failed');
    expect(logFor(first.Endpoint)?.Status).toBe('Failed');
    expect(outcomeFor(result, 'second@example.com')?.Status).toBe('Sent');
  });

  it('fails closed when the sender credential cannot be resolved: nothing is sent', async () => {
    arrange({ Sender: { CredentialID: IDS.Credential } });
    SeedEndpoint(db, 'alice@example.com');
    vi.spyOn(CredentialEngine.Instance, 'Config').mockResolvedValue(undefined);
    vi.spyOn(CredentialEngine.Instance, 'GetCredential').mockRejectedValue(new Error('Credential has expired'));

    await expect(send([toAddress('alice@example.com')])).rejects.toThrow('Credential has expired');

    expect(provider.Attempts).toHaveLength(0);
    expect(logs()).toHaveLength(0);
  });
});

describe('V2SendService.Send — Save() failures', () => {
  it('does not send when the log row cannot be created', async () => {
    SeedEndpoint(db, 'alice@example.com');
    db.FailSave(ENTITY.Logs, { Message: 'Simulated Save failure: deadlock victim' });

    const result = await send([toAddress('alice@example.com')]);

    expect(provider.Attempts).toHaveLength(0);
    expect(result.QueuedCount).toBe(0);
    expect(result.Outcomes?.[0]).toMatchObject({
      Status: 'Failed',
      Reason: 'LogCreationFailed',
      Detail: 'Simulated Save failure: deadlock victim',
    });
    expect(logs()).toHaveLength(0);
  });

  it('does not send when a Failed log cannot be re-claimed In-Progress', async () => {
    const alice = SeedEndpoint(db, 'alice@example.com');
    const run = SeedRun(db);
    seedLog(run, alice, { Status: 'Failed', ErrorMessage: 'earlier failure' });
    db.FailSave(ENTITY.Logs);

    const result = await send([toAddress('alice@example.com')], envelope('Operational'), String(run.ID));

    expect(provider.Attempts).toHaveLength(0);
    expect(result.Outcomes?.[0]).toMatchObject({ Status: 'Failed', Reason: 'LogClaimFailed' });
    expect(logFor(alice)?.Status).toBe('Failed');
  });

  it('recovers when recording the result fails once: the bounded retry saves it', async () => {
    const alice = SeedEndpoint(db, 'alice@example.com');
    db.FailSave(ENTITY.Logs, { When: (row) => row.Status === 'Complete', Times: 1 });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await send([toAddress('alice@example.com')]);

    expect(provider.Attempts).toHaveLength(1);
    expect(result.Outcomes?.[0]).toMatchObject({ Status: 'Sent' });
    expect(logFor(alice)?.Status).toBe('Complete');
  });

  describe('delivery guarantee for a log stuck In-Progress', () => {
    const STALE = (): Date => new Date(Date.now() - 60 * 60 * 1000);

    it('At Most Once (the default): reports OutcomeUnknown and never calls the provider', async () => {
      const alice = SeedEndpoint(db, 'alice@example.com');
      const run = SeedRun(db);
      seedLog(run, alice, { Status: 'In-Progress', __mj_UpdatedAt: STALE() });

      const result = await send([toAddress('alice@example.com')], envelope('Operational'), String(run.ID));

      expect(provider.Attempts).toHaveLength(0);
      expect(result.Outcomes?.[0]).toMatchObject({ Status: 'Failed', Reason: 'OutcomeUnknown' });
      expect(result.Outcomes?.[0].Detail).toContain('At Most Once');
      expect(logFor(alice)?.Status).toBe('In-Progress');
    });

    it('At Least Once on the provider: reclaims the stale log atomically and sends it exactly once', async () => {
      arrange({ ProviderDeliveryGuarantee: 'At Least Once' });
      const alice = SeedEndpoint(db, 'alice@example.com');
      const run = SeedRun(db);
      seedLog(run, alice, { Status: 'In-Progress', __mj_UpdatedAt: STALE() });

      const result = await send([toAddress('alice@example.com')], envelope('Operational'), String(run.ID));
      const again = await send([toAddress('alice@example.com')], envelope('Operational'), String(run.ID));

      expect(provider.Attempts).toHaveLength(1);
      expect(result.Outcomes?.[0]).toMatchObject({ Status: 'Sent' });
      // The repeat finds the log Complete and reports it without calling the provider again.
      expect(again.Outcomes).toHaveLength(1);
      expect(logFor(alice)?.Status).toBe('Complete');
      expect(db.ExecuteSQLCalls.filter((c) => c === 'V2SendService.tryAtomicClaimLog')).toHaveLength(1);
    });

    it('At Least Once on the envelope overrides an At Most Once provider', async () => {
      const alice = SeedEndpoint(db, 'alice@example.com');
      const run = SeedRun(db);
      seedLog(run, alice, { Status: 'In-Progress', __mj_UpdatedAt: STALE() });

      const result = await send(
        [toAddress('alice@example.com')],
        envelope('Operational', { DeliveryGuarantee: 'At Least Once' }),
        String(run.ID),
      );

      expect(provider.Attempts).toHaveLength(1);
      expect(result.Outcomes?.[0]).toMatchObject({ Status: 'Sent' });
    });

    it.each(['At Most Once', 'At Least Once'] as const)(
      'a fresh In-Progress log is LogAlreadyInProgress under %s',
      async (guarantee) => {
        const alice = SeedEndpoint(db, 'alice@example.com');
        const run = SeedRun(db);
        seedLog(run, alice, { Status: 'In-Progress', __mj_UpdatedAt: new Date() });

        const result = await send(
          [toAddress('alice@example.com')],
          envelope('Operational', { DeliveryGuarantee: guarantee }),
          String(run.ID),
        );

        expect(provider.Attempts).toHaveLength(0);
        expect(result.Outcomes?.[0]).toMatchObject({ Status: 'Failed', Reason: 'LogAlreadyInProgress' });
      },
    );
  });

  it('reports PostSendLogSaveFailed when the result cannot be recorded, and a retry does not send twice', async () => {
    const alice = SeedEndpoint(db, 'alice@example.com');
    const run = SeedRun(db);
    db.FailSave(ENTITY.Logs, { When: (row) => row.Status === 'Complete', Times: 3 });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const first = await send([toAddress('alice@example.com')], envelope('Operational'), String(run.ID));
    expect(provider.Delivered).toHaveLength(1);
    expect(first.QueuedCount).toBe(0);
    expect(first.Outcomes?.[0]).toMatchObject({ Status: 'Failed', Reason: 'PostSendLogSaveFailed' });
    expect(logFor(alice)?.Status).toBe('In-Progress');
    expect(logFor(alice)?.ProviderMessageID ?? null).toBeNull();

    const retry = await send([toAddress('alice@example.com')], envelope('Operational'), String(run.ID));
    expect(provider.Attempts).toHaveLength(1);
    expect(retry.Outcomes?.[0]).toMatchObject({ Status: 'Failed', Reason: 'LogAlreadyInProgress' });
  });

  it('fails the send when the communication run cannot be created', async () => {
    SeedEndpoint(db, 'alice@example.com');
    db.FailSave(ENTITY.Runs);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await send([toAddress('alice@example.com')]);

    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toBe('Failed to create communication run');
    expect(provider.Attempts).toHaveLength(0);
  });
});

describe('V2SendService.CheckV1ComplianceGate', () => {
  it('blocks a V1 send to an address whose principal unsubscribed, not only an address-level suppression', async () => {
    const alice = SeedEndpoint(db, 'alice@example.com');
    db.Seed('MJ: Communication Endpoint Principals', {
      CommunicationEndpointID: alice.ID,
      EntityID: IDS.ContactsEntity,
      RecordID: 'contact-1',
      FirstSeenAt: new Date(),
      LastSeenAt: new Date(),
    });
    SeedSuppression(db, { EntityID: IDS.ContactsEntity, RecordID: 'contact-1', Reason: 'User Unsubscribe', Source: 'One-Click Header' });

    const operational = await service.CheckV1ComplianceGate(IDS.ChannelEmail, 'alice@example.com', 'Operational', users.CallerUser);
    const transactional = await service.CheckV1ComplianceGate(IDS.ChannelEmail, 'alice@example.com', 'Transactional', users.CallerUser);

    expect(operational).toMatchObject({ Allowed: false, Reason: 'User Unsubscribe' });
    expect(transactional.Allowed).toBe(true);
  });

  it('fails closed when the principal links cannot be read', async () => {
    SeedEndpoint(db, 'alice@example.com');
    db.FailRunView('MJ: Communication Endpoint Principals');

    const result = await service.CheckV1ComplianceGate(IDS.ChannelEmail, 'alice@example.com', 'Operational', users.CallerUser);

    expect(result).toMatchObject({ Allowed: false, Reason: 'GateLookupFailed' });
  });
});

describe('V2SendService.Send — runs split into chunks', () => {
  function sendChunk(address: string, run: FakeRow, index: number, count: number): Promise<SendV2Result> {
    return service.Send(
      {
        Envelope: envelope('Operational'),
        Payload: PAYLOAD,
        Recipients: [toAddress(address)],
        CommunicationRunID: String(run.ID),
        RunChunk: { Index: index, Count: count },
      },
      users.CallerUser,
      () => provider.AsProvider(),
    );
  }

  const RUN_CHUNKS = 'MJ: Communication Run Chunks';
  const runRow = (run: FakeRow): FakeRow | undefined => db.Rows(ENTITY.Runs).find((r) => SameID(String(r.ID), String(run.ID)));
  const chunkRows = (run: FakeRow): FakeRow[] =>
    db.Rows(RUN_CHUNKS).filter((r) => SameID(String(r.CommunicationRunID), String(run.ID)));

  it('leaves a passed-in run open until its last chunk finishes, then ends it once', async () => {
    for (const a of ['a@example.com', 'b@example.com', 'c@example.com']) SeedEndpoint(db, a);
    const run = SeedRun(db, { ChunkCount: 3 });

    await sendChunk('c@example.com', run, 2, 3);
    expect(runRow(run)?.EndedAt ?? null).toBeNull();
    await sendChunk('a@example.com', run, 0, 3);
    await sendChunk('a@example.com', run, 0, 3); // redelivered chunk: not counted twice
    expect(chunkRows(run)).toHaveLength(2);
    expect(runRow(run)?.Status).toBe('Pending');
    expect(runRow(run)?.EndedAt ?? null).toBeNull();

    await sendChunk('b@example.com', run, 1, 3);
    expect(chunkRows(run).map((c) => c.ChunkIndex).sort()).toEqual([0, 1, 2]);
    expect(chunkRows(run).every((c) => c.Status === 'Complete')).toBe(true);
    expect(runRow(run)?.Status).toBe('Complete');
    expect(runRow(run)?.EndedAt).toBeInstanceOf(Date);
    expect(provider.Attempts).toHaveLength(3);
  });

  it('a chunk refused and then redelivered successfully flips its row and the run to Complete', async () => {
    SeedEndpoint(db, 'a@example.com');
    const run = SeedRun(db, { ChunkCount: 1 });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const chunk = (senderID: string) =>
      service.Send(
        {
          Envelope: envelope('Operational', { SenderID: senderID }),
          Payload: PAYLOAD,
          Recipients: [toAddress('a@example.com')],
          CommunicationRunID: String(run.ID),
          RunChunk: { Index: 0, Count: 1 },
        },
        users.CallerUser,
        () => provider.AsProvider(),
      );

    await chunk('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
    expect(chunkRows(run)).toMatchObject([{ Status: 'Failed', ErrorMessage: 'Sender not found' }]);
    expect(runRow(run)?.Status).toBe('Failed');

    await chunk(IDS.Sender);
    expect(chunkRows(run)).toHaveLength(1);
    expect(chunkRows(run)[0].Status).toBe('Complete');
    expect(runRow(run)?.Status).toBe('Complete');
  });

  it('counts a chunk that lost a save race to a concurrent redelivery as recorded', async () => {
    SeedEndpoint(db, 'a@example.com');
    const run = SeedRun(db, { ChunkCount: 1 });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    db.OnceBeforeSave(RUN_CHUNKS, () => {
      db.Seed(RUN_CHUNKS, { CommunicationRunID: run.ID, ChunkIndex: 0, Status: 'Complete', RecipientCount: 1, CompletedAt: new Date() });
    });

    await sendChunk('a@example.com', run, 0, 1);

    expect(chunkRows(run)).toHaveLength(1);
    expect(runRow(run)?.Status).toBe('Complete');
  });

  it('counts a chunk that Send() refuses before sending, and one that throws, so the run still ends', async () => {
    SeedEndpoint(db, 'a@example.com');
    const run = SeedRun(db);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const chunk = (index: number, senderID: string, getProvider: () => ReturnType<FakeSendProvider['AsProvider']>) =>
      service.Send(
        {
          Envelope: envelope('Operational', { SenderID: senderID }),
          Payload: PAYLOAD,
          Recipients: [toAddress('a@example.com')],
          CommunicationRunID: String(run.ID),
          RunChunk: { Index: index, Count: 3 },
        },
        users.CallerUser,
        getProvider,
      );

    const refused = await chunk(0, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', () => provider.AsProvider());
    await expect(
      chunk(1, IDS.Sender, () => {
        throw new Error('provider unavailable');
      }),
    ).rejects.toThrow('provider unavailable');
    await chunk(0, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', () => provider.AsProvider()); // redelivered: not counted twice
    expect(chunkRows(run)).toHaveLength(2);
    expect(db.Rows(ENTITY.Runs)[0].EndedAt ?? null).toBeNull();
    await chunk(2, IDS.Sender, () => provider.AsProvider());

    expect(refused).toMatchObject({ Success: false, ErrorMessage: 'Sender not found' });
    expect(chunkRows(run).find((c) => c.ChunkIndex === 1)).toMatchObject({ Status: 'Failed', ErrorMessage: 'provider unavailable' });
    // Every chunk is recorded, but two were refused, so the run ends Failed.
    expect(db.Rows(ENTITY.Runs)[0].Status).toBe('Failed');
    expect(db.Rows(ENTITY.Runs)[0].EndedAt).toBeInstanceOf(Date);
    expect(provider.Attempts).toHaveLength(1);
  });

  it('does not end a passed-in run when the chunk does not say where it sits', async () => {
    SeedEndpoint(db, 'a@example.com');
    const run = SeedRun(db);

    await send([toAddress('a@example.com')], envelope('Operational'), String(run.ID));

    expect(db.Rows(ENTITY.Runs)[0].Status).toBe('Pending');
  });

  it('stamps each queued chunk with its position and the acting user', async () => {
    const published: Array<Record<string, unknown>> = [];
    service.Configure({ AsyncThreshold: 2, ChunkSize: 2, EnqueueWork: async (_t, payload) => { published.push(payload); } });

    const result = await send(['a', 'b', 'c', 'd', 'e'].map((x) => toAddress(`${x}@example.com`)));

    expect(result.IsAsyncRun).toBe(true);
    expect(published.map((p) => p.RunChunk)).toEqual([{ Index: 0, Count: 3 }, { Index: 1, Count: 3 }, { Index: 2, Count: 3 }]);
    expect(published.every((p) => p.ActingUserID === users.CallerUser.ID)).toBe(true);
    // The run knows its chunk count before any chunk can finish.
    expect(db.Rows(ENTITY.Runs).find((r) => SameID(String(r.ID), String(result.CommunicationRunID)))?.ChunkCount).toBe(3);
  });

  it('stores an envelope delivery guarantee on a chunked run', async () => {
    service.Configure({ AsyncThreshold: 2, ChunkSize: 2, EnqueueWork: async () => undefined });

    const result = await send(
      ['a', 'b', 'c'].map((x) => toAddress(`${x}@example.com`)),
      envelope('Operational', { DeliveryGuarantee: 'At Least Once' }),
    );

    expect(db.Rows(ENTITY.Runs).find((r) => SameID(String(r.ID), String(result.CommunicationRunID)))?.DeliveryGuarantee).toBe('At Least Once');
  });

  it('marks a dry-run log with IsDryRun and does not count it as sent', async () => {
    const alice = SeedEndpoint(db, 'alice@example.com');

    const result = await send([toAddress('alice@example.com')], envelope('Operational', { DryRun: true }));

    expect(result.Outcomes?.[0].Status).toBe('DryRun');
    expect(result.QueuedCount).toBe(0);
    expect(logFor(alice)?.IsDryRun).toBe(true);
    expect(logFor(alice)?.Status).toBe('Complete');
  });
});

describe('V2SendService.Send — RunView failures are errors, never "no rows"', () => {
  it('suppression lookup failure aborts the send instead of treating recipients as unsuppressed', async () => {
    const carol = SeedEndpoint(db, 'carol@example.com');
    SeedSuppression(db, { CommunicationEndpointID: carol.ID, Reason: 'Hard Bounce', Source: 'Provider Webhook' });
    db.FailRunView(ENTITY.Suppressions);

    await expect(send([toAddress('carol@example.com')])).rejects.toThrow('Failed loading communication suppressions');

    expect(provider.Attempts).toHaveLength(0);
    expect(logs()).toHaveLength(0);
  });

  it('preference lookup failure aborts the send', async () => {
    SeedEndpoint(db, 'alice@example.com');
    db.FailRunView(ENTITY.Preferences);

    await expect(send([toAddress('alice@example.com')], envelope('Marketing', { PreferenceID: IDS.Preference }))).rejects.toThrow(
      'Failed loading communication preference',
    );

    expect(provider.Attempts).toHaveLength(0);
  });

  it('principal-preference lookup failure aborts the send instead of assuming no opt-out', async () => {
    const bob = SeedPrincipal(db, 'contact-1', 'bob@example.com');
    db.FailRunView(ENTITY.PrincipalPreferences);

    await expect(send([{ Principal: bob.Ref }], envelope('Marketing', { PreferenceID: IDS.Preference }))).rejects.toThrow(
      'Failed loading communication principal preferences',
    );

    expect(provider.Attempts).toHaveLength(0);
  });

  it('sender lookup failure fails the send before a run is created', async () => {
    SeedEndpoint(db, 'alice@example.com');
    db.FailRunView(ENTITY.Senders);

    const result = await send([toAddress('alice@example.com')]);

    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toBeTruthy();
    expect(provider.Attempts).toHaveLength(0);
    expect(db.Rows(ENTITY.Runs)).toHaveLength(0);
  });

  it('sender-permission lookup failure denies the send', async () => {
    SeedEndpoint(db, 'alice@example.com');
    db.FailRunView(ENTITY.SenderPermissions, { Message: 'permission view timed out' });

    const result = await send([toAddress('alice@example.com')]);

    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toContain('Failed verifying sender permissions: permission view timed out');
    expect(provider.Attempts).toHaveLength(0);
  });

  it('parent-sender lookup failure must not bypass the inherited sender ACL', async () => {
    arrange({ Sender: { ParentSenderID: IDS.ParentSender } });
    SeedSender(db, { ID: IDS.ParentSender, Name: 'Parent Org', IsDefault: false });
    db.Seed(ENTITY.SenderPermissions, {
      CommunicationSenderID: IDS.ParentSender,
      RoleID: '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f',
      UserID: null,
      PermissionLevel: 'Send',
      AppliesToChildSenders: true,
    });
    SeedEndpoint(db, 'alice@example.com');
    db.FailRunView(ENTITY.Senders, {
      When: (params) =>
        String(params.ExtraFilter ?? '')
          .toLowerCase()
          .includes(IDS.ParentSender),
    });

    const result = await send([toAddress('alice@example.com')]);

    expect(result.Success).toBe(false);
    expect(provider.Attempts).toHaveLength(0);
  });

  it('run lookup failure fails the send without starting a new run', async () => {
    SeedEndpoint(db, 'alice@example.com');
    const run = SeedRun(db);
    db.FailRunView(ENTITY.Runs, { Message: 'run view timed out' });

    const result = await send([toAddress('alice@example.com')], envelope('Operational'), String(run.ID));

    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toContain('run view timed out');
    expect(provider.Attempts).toHaveLength(0);
    expect(db.Rows(ENTITY.Runs)).toHaveLength(1);
  });

  it('an unknown CommunicationRunID fails the send without starting a new run', async () => {
    SeedEndpoint(db, 'alice@example.com');

    const result = await send([toAddress('alice@example.com')], envelope('Operational'), 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');

    expect(result.Success).toBe(false);
    expect(result.ErrorMessage).toContain('was not found');
    expect(provider.Attempts).toHaveLength(0);
    expect(db.Rows(ENTITY.Runs)).toHaveLength(0);
  });

  it('existing-log lookup failure on a re-delivered run does not re-send an already Complete message', async () => {
    const alice = SeedEndpoint(db, 'alice@example.com');
    const run = SeedRun(db);
    seedLog(run, alice, { Status: 'Complete', ProviderMessageID: 'pm-earlier' });
    db.FailRunView(ENTITY.Logs);

    const result = await send([toAddress('alice@example.com')], envelope('Operational'), String(run.ID));

    expect(provider.Attempts).toHaveLength(0);
    expect(result.Outcomes?.[0]).toMatchObject({ Status: 'Failed', Reason: 'LogLookupFailed' });
    expect(logs()).toHaveLength(1);
  });

  it('winner lookup failure after a duplicate-key save does not send the duplicate', async () => {
    SeedEndpoint(db, 'alice@example.com');
    db.FailRunView(ENTITY.Logs);

    const result = await send([toAddress('alice@example.com'), toAddress('ALICE@example.com')]);

    expect(provider.Attempts).toHaveLength(1);
    expect(logs()).toHaveLength(1);
    expect(result.Outcomes?.map((o) => o.Status)).toEqual(['Sent', 'Failed']);
    expect(result.Outcomes?.[1].Reason).toBe('LogCreationFailed');
  });

  it('endpoint lookup failure blocks the recipient rather than sending', async () => {
    SeedEndpoint(db, 'alice@example.com');
    db.FailRunView(ENTITY.Endpoints);

    const result = await send([toAddress('alice@example.com')]);

    expect(provider.Attempts).toHaveLength(0);
    expect(result).toMatchObject({ QueuedCount: 0, BlockedCount: 1 });
    expect(result.Outcomes?.[0].Status).toBe('Blocked');
  });

  it('sending-domain lookup failure is treated as unverified', async () => {
    arrange({ RequireVerifiedDomain: true });
    SeedEndpoint(db, 'alice@example.com');
    db.Seed(ENTITY.SendingDomains, {
      CommunicationProviderID: IDS.Provider,
      Domain: 'example.org',
      CredentialID: null,
      Status: 'Verified',
    });
    db.FailRunView(ENTITY.SendingDomains);

    const result = await send([toAddress('alice@example.com')]);

    expect(result.Success).toBe(false);
    expect(provider.Attempts).toHaveLength(0);
  });
});
