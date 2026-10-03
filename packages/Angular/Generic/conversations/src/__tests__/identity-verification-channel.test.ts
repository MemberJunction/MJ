// The channel imports its standalone Angular surface component (partial-compiled Angular libs require the JIT
// compiler in this node test environment), so load the compiler FIRST.
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Subject } from 'rxjs';
import { MJGlobal } from '@memberjunction/global';
import type { IMetadataProvider } from '@memberjunction/core';
import type { GraphQLDataProvider, GraphQLRealtimeSessionClient, RealtimeSessionVerificationResult } from '@memberjunction/graphql-dataprovider';
import type { IdentityVerifiedEventPayload } from '@memberjunction/ai-core-plus';
import {
  BaseRealtimeChannelClient,
  type RealtimeChannelContext,
  type RealtimeSessionStreamEvent
} from '@memberjunction/realtime-runtime';
import {
  IDENTITY_VERIFICATION_CHANNEL_NAME,
  IdentityVerificationChannel,
  LoadIdentityVerificationChannel
} from '../lib/components/realtime/identity-verification/identity-verification-channel';
import {
  IdentityVerificationModel,
  type IdentityVerificationService
} from '../lib/components/realtime/identity-verification/identity-verification-model';

LoadIdentityVerificationChannel();

// ── helpers ─────────────────────────────────────────────────────────────────

const OK: RealtimeSessionVerificationResult = { Success: true, VerificationState: 'pending', SendsRemaining: 2, AttemptsRemaining: 5 };
const VERIFIED: RealtimeSessionVerificationResult = {
  Success: true,
  VerificationState: 'verified',
  VerifiedEmail: 'ada@example.com',
  VerifiedAt: '2030-01-01T00:00:00Z'
};

function fail(code: string, extra: Partial<RealtimeSessionVerificationResult> = {}): RealtimeSessionVerificationResult {
  return { Success: false, VerificationState: 'unverified', ErrorCode: code, ...extra };
}

/** A scripted service that records what it was asked and answers from queues. */
class FakeService implements IdentityVerificationService {
  public Requests: Array<{ Name: string; Email: string }> = [];
  public Codes: string[] = [];
  public RequestAnswers: RealtimeSessionVerificationResult[] = [];
  public CodeAnswers: RealtimeSessionVerificationResult[] = [];
  public async Request(input: { Name: string; Email: string }) {
    this.Requests.push(input);
    return this.RequestAnswers.shift() ?? OK;
  }
  public async SubmitCode(code: string) {
    this.Codes.push(code);
    return this.CodeAnswers.shift() ?? VERIFIED;
  }
}

function model(service: IdentityVerificationService | null = new FakeService(), now: () => number = () => 1_000_000) {
  return { m: new IdentityVerificationModel(service, now), service };
}

/** A model with both details filled by the user (so confirmed). */
function readyModel(service = new FakeService(), now?: () => number) {
  const { m } = model(service, now);
  m.Fill({ field: 'name', value: 'Ada Lovelace' }, 'user');
  m.Fill({ field: 'email', value: 'ada@example.com' }, 'user');
  return { m, service };
}

const verifiedPayload = (overrides: Partial<IdentityVerifiedEventPayload> = {}): IdentityVerifiedEventPayload => ({
  VerifiedEmail: 'ada@example.com',
  VerifiedName: 'Ada Lovelace',
  VerifiedAt: '2030-01-01T00:00:00Z',
  Method: 'link',
  ...overrides
});

// ── the state machine ───────────────────────────────────────────────────────

describe('IdentityVerificationModel — fill and confirm', () => {
  it('a value the USER types is confirmed by being theirs', () => {
    const { m } = model();
    expect(m.Fill({ field: 'name', value: '  Ada  ' }, 'user').Success).toBe(true);
    expect(m.View.Name).toEqual({ Value: 'Ada', Source: 'user', Confirmed: true });
  });

  it('a value the AGENT fills is NOT confirmed — it is only a suggestion', () => {
    const { m } = model();
    m.Fill({ field: 'email', value: 'ada@example.com' }, 'agent');
    expect(m.View.Email).toEqual({ Value: 'ada@example.com', Source: 'agent', Confirmed: false });
    expect(m.View.CanSubmit).toBe(false);
  });

  it('refuses an email that is not shaped like one, telling the agent to ask again', () => {
    const { m } = model();
    const r = m.Fill({ field: 'email', value: 'ada at example dot com' }, 'agent');
    expect(r).toMatchObject({ Success: false, ErrorCode: 'invalid_params' });
    expect(m.View.Email.Value).toBe('');
  });

  it('refuses an unknown field and an empty value', () => {
    const { m } = model();
    expect(m.Fill({ field: 'phone', value: 'x' }, 'agent')).toMatchObject({ Success: false, ErrorCode: 'invalid_params' });
    expect(m.Fill({ field: 'name', value: '   ' }, 'agent')).toMatchObject({ Success: false, ErrorCode: 'invalid_params' });
  });

  it('caps an over-long value instead of storing it whole', () => {
    const { m } = model();
    m.Fill({ field: 'name', value: 'x'.repeat(500) }, 'user');
    expect(m.View.Name.Value).toHaveLength(200);
  });

  it('the agent repeating what the user already typed does NOT un-confirm it', () => {
    const { m } = model();
    m.Fill({ field: 'name', value: 'Ada' }, 'user');
    m.Fill({ field: 'name', value: 'Ada' }, 'agent');
    expect(m.View.Name).toEqual({ Value: 'Ada', Source: 'user', Confirmed: true });
  });

  it('the agent OVERWRITING what the user typed makes it an unconfirmed suggestion again', () => {
    const { m } = model();
    m.Fill({ field: 'name', value: 'Ada' }, 'user');
    m.Fill({ field: 'name', value: 'Ada L' }, 'agent');
    expect(m.View.Name).toEqual({ Value: 'Ada L', Source: 'agent', Confirmed: false });
  });

  it('the user typing exactly what the agent suggested counts as confirming it', () => {
    const { m } = model();
    m.Fill({ field: 'name', value: 'Ada' }, 'agent');
    m.Fill({ field: 'name', value: 'Ada' }, 'user');
    expect(m.View.Name).toEqual({ Value: 'Ada', Source: 'user', Confirmed: true });
  });

  it('confirm is refused for the agent — whatever the descriptor says — and changes nothing', () => {
    const { m } = model();
    m.Fill({ field: 'name', value: 'Ada' }, 'agent');
    const r = m.Confirm({}, 'agent');
    expect(r).toMatchObject({ Success: false, ErrorCode: 'not_invokable_by_agent' });
    expect(m.View.Name.Confirmed).toBe(false);
  });

  it('the user confirms one field, or both when none is named', () => {
    const { m } = model();
    m.Fill({ field: 'name', value: 'Ada' }, 'agent');
    m.Fill({ field: 'email', value: 'ada@example.com' }, 'agent');
    expect(m.Confirm({ field: 'name' }, 'user').Success).toBe(true);
    expect(m.View.Name.Confirmed).toBe(true);
    expect(m.View.Email.Confirmed).toBe(false);
    expect(m.Confirm({}, 'user').Success).toBe(true);
    expect(m.View.Email.Confirmed).toBe(true);
    expect(m.View.CanSubmit).toBe(true);
  });

  it('confirm reports when there is nothing to confirm, and rejects a bad field', () => {
    const { m } = model();
    expect(m.Confirm({}, 'user')).toMatchObject({ Success: false });
    expect(m.Confirm({ field: 'phone' }, 'user')).toMatchObject({ Success: false, ErrorCode: 'invalid_params' });
  });

  it('host-seeded values are unconfirmed and never overwrite what is already there', () => {
    const { m } = model();
    m.Seed({ name: 'Ada', email: 'ada@example.com' });
    expect(m.View.Name).toEqual({ Value: 'Ada', Source: 'host', Confirmed: false });
    m.Fill({ field: 'name', value: 'Grace' }, 'user');
    m.Seed({ name: 'Ada' });
    expect(m.View.Name.Value).toBe('Grace');
  });
});

describe('IdentityVerificationModel — submit and resend', () => {
  it('refuses to send until both details exist and the USER has confirmed them', async () => {
    const { m, service } = model();
    expect(await m.Submit()).toMatchObject({ Success: false, ErrorCode: 'verb_failed' });
    m.Fill({ field: 'name', value: 'Ada' }, 'agent');
    m.Fill({ field: 'email', value: 'ada@example.com' }, 'agent');
    const r = await m.Submit();
    expect(r).toMatchObject({ Success: false });
    expect(r.Error).toContain('cannot confirm for them');
    expect(service.Requests).toHaveLength(0); // nothing was ever sent to an unconfirmed address
  });

  it('sends the confirmed values and moves to code_sent', async () => {
    const { m, service } = readyModel();
    const r = await m.Submit();
    expect(r.Success).toBe(true);
    expect(service.Requests).toEqual([{ Name: 'Ada Lovelace', Email: 'ada@example.com' }]);
    expect(m.View).toMatchObject({ Status: 'code_sent', Destination: 'ada@example.com', SendsRemaining: 2, AttemptsRemaining: 5 });
  });

  it('shows "sending" while the request is in flight and refuses a second one', async () => {
    const service = new FakeService();
    let release: (r: RealtimeSessionVerificationResult) => void = () => undefined;
    service.Request = () => new Promise((resolve) => (release = resolve));
    const { m } = readyModel(service);
    const first = m.Submit();
    expect(m.View.Status).toBe('sending');
    expect(await m.Submit()).toMatchObject({ Success: false });
    release(OK);
    await first;
    expect(m.View.Status).toBe('code_sent');
  });

  it('a server refusal returns to collecting with the reason in words, keeping the details', async () => {
    const service = new FakeService();
    service.RequestAnswers = [fail('consumer_domain', { Message: 'Please use your work email.' })];
    const { m } = readyModel(service);
    const r = await m.Submit();
    expect(r).toMatchObject({ Success: false, ErrorCode: 'consumer_domain', Error: 'Please use your work email.' });
    expect(m.View).toMatchObject({ Status: 'collecting', Problem: 'Please use your work email.', ProblemCode: 'consumer_domain' });
    expect(m.View.Email.Value).toBe('ada@example.com');
  });

  it('falls back to its own words when the server gave none', async () => {
    const service = new FakeService();
    service.RequestAnswers = [fail('invalid_email')];
    const { m } = readyModel(service);
    await m.Submit();
    expect(m.View.Problem).toContain('valid email');
  });

  it('honours the server back-off before another send', async () => {
    let now = 1_000_000;
    const service = new FakeService();
    service.RequestAnswers = [{ ...OK, RetryAfterSeconds: 30 }];
    const { m } = readyModel(service, () => now);
    await m.Submit();
    expect(m.View.ResendAvailableAt).toBe(1_030_000);
    const early = await m.Resend();
    expect(early).toMatchObject({ Success: false, ErrorCode: 'rate_limited' });
    expect(early.Error).toContain('30');
    now += 31_000;
    expect((await m.Resend()).Success).toBe(true);
    expect(service.Requests).toHaveLength(2);
  });

  it('resend is only for after a code was sent; submit is not for resending', async () => {
    const { m } = readyModel();
    expect(await m.Resend()).toMatchObject({ Success: false });
    await m.Submit();
    expect(await m.Submit()).toMatchObject({ Success: false }); // a code is already out — use resend
  });

  it('stops when the server says no more sends are left', async () => {
    const service = new FakeService();
    service.RequestAnswers = [{ ...OK, SendsRemaining: 0 }];
    const { m } = readyModel(service);
    await m.Submit();
    expect(await m.Resend()).toMatchObject({ Success: false, ErrorCode: 'send_limit_reached' });
  });

  it('changing a detail after the code was sent makes that code stale: back to collecting, no destination', async () => {
    const { m } = readyModel();
    await m.Submit();
    m.Fill({ field: 'email', value: 'ada@other.example' }, 'user');
    expect(m.View).toMatchObject({ Status: 'collecting', Destination: '' });
    expect(m.View.CanSubmit).toBe(true);
  });

  it('refuses to send when verification is not available in this session', async () => {
    const { m } = model(null);
    m.Fill({ field: 'name', value: 'Ada' }, 'user');
    m.Fill({ field: 'email', value: 'ada@example.com' }, 'user');
    expect(await m.Submit()).toMatchObject({ Success: false });
  });
});

describe('IdentityVerificationModel — entering the code', () => {
  async function codeSent(service = new FakeService()) {
    const { m } = readyModel(service);
    await m.Submit();
    return { m, service };
  }

  it('needs a code to have been sent first', async () => {
    const { m } = readyModel();
    expect(await m.EnterCode({ code: '123456' })).toMatchObject({ Success: false });
  });

  it('hands the code to the server and applies the verification as a fallback for a transport with no events', async () => {
    const { m, service } = await codeSent();
    const r = await m.EnterCode({ code: '123 456' });
    expect(r.Success).toBe(true);
    expect(service.Codes).toEqual(['123 456']);
    expect(m.View.Status).toBe('verified');
  });

  it('NEVER keeps the code: it is in no view, state or result', async () => {
    const { m } = await codeSent();
    const secret = '987654';
    const r = await m.EnterCode({ code: secret });
    expect(JSON.stringify(m.View)).not.toContain(secret);
    expect(JSON.stringify(m.ToState())).not.toContain(secret);
    expect(JSON.stringify(r)).not.toContain(secret);
  });

  it('a wrong code keeps the code stage and reports the tries left', async () => {
    const service = new FakeService();
    service.CodeAnswers = [fail('invalid_code', { AttemptsRemaining: 3 })];
    const { m } = await codeSent(service);
    const r = await m.EnterCode({ code: '000000' });
    expect(r).toMatchObject({ Success: false, ErrorCode: 'invalid_code' });
    expect(m.View).toMatchObject({ Status: 'code_sent', AttemptsRemaining: 3, ProblemCode: 'invalid_code' });
  });

  for (const code of ['code_expired', 'attempts_exhausted', 'no_pending_verification']) {
    it(`${code} sends the person back to request a new code, keeping their confirmed details`, async () => {
      const service = new FakeService();
      service.CodeAnswers = [fail(code)];
      const { m } = await codeSent(service);
      await m.EnterCode({ code: '000000' });
      expect(m.View.Status).toBe('collecting');
      expect(m.View.CanSubmit).toBe(true);
      expect((await m.Submit()).Success).toBe(true);
    });
  }

  it('rejects an empty code before bothering the server', async () => {
    const { m, service } = await codeSent();
    expect(await m.EnterCode({ code: '   ' })).toMatchObject({ Success: false, ErrorCode: 'invalid_params' });
    expect(service.Codes).toHaveLength(0);
  });

  it('shows "verifying" while the code is checked, and the server event beating the answer wins', async () => {
    const service = new FakeService();
    let release: (r: RealtimeSessionVerificationResult) => void = () => undefined;
    service.SubmitCode = () => new Promise((resolve) => (release = resolve));
    const { m } = await codeSent(service);
    const pending = m.EnterCode({ code: '123456' });
    expect(m.View.Status).toBe('verifying');
    expect(m.MarkVerified(verifiedPayload({ Method: 'code' }))).toBe(true);
    release(fail('invalid_code')); // a late, stale answer
    expect((await pending).Success).toBe(true);
    expect(m.View.Status).toBe('verified');
    expect(m.View.Problem).toBe('');
  });
});

describe('IdentityVerificationModel — the server decides', () => {
  it('MarkVerified is idempotent and adopts the server\'s email and name', () => {
    const { m } = model();
    expect(m.MarkVerified(verifiedPayload({ VerifiedEmail: 'ada@corp.example', VerifiedName: 'Ada L.' }))).toBe(true);
    expect(m.MarkVerified(verifiedPayload())).toBe(false);
    expect(m.View).toMatchObject({ Status: 'verified', Destination: 'ada@corp.example' });
    expect(m.View.Email.Value).toBe('ada@corp.example');
    expect(m.View.Name.Value).toBe('Ada L.');
  });

  it('keeps what the person entered when a recovered event carries no name', () => {
    const { m } = readyModel();
    m.MarkVerified(verifiedPayload({ VerifiedName: '', Recovered: true }));
    expect(m.View.Name.Value).toBe('Ada Lovelace');
  });

  it('refuses every further fill or send once verified', async () => {
    const { m } = readyModel();
    m.MarkVerified(verifiedPayload());
    expect(m.Fill({ field: 'name', value: 'X' }, 'agent')).toMatchObject({ Success: false, ErrorCode: 'already_verified' });
    expect(await m.Submit()).toMatchObject({ Success: false, ErrorCode: 'already_verified' });
    expect(await m.EnterCode({ code: '1' })).toMatchObject({ Success: false, ErrorCode: 'already_verified' });
  });

  it('reports every change to its listener, with who caused it', () => {
    const { m } = model();
    const seen: Array<{ Author: string; Event?: string }> = [];
    m.OnChange((c) => seen.push({ Author: c.Author, Event: c.Event?.Name }));
    m.Fill({ field: 'name', value: 'Ada' }, 'agent');
    m.Confirm({ field: 'name' }, 'user');
    m.MarkVerified(verifiedPayload());
    expect(seen).toEqual([
      { Author: 'agent', Event: 'field_filled' },
      { Author: 'user', Event: 'confirmed' },
      { Author: 'system', Event: 'verified' }
    ]);
  });
});

// ── the channel ─────────────────────────────────────────────────────────────

class TestChannel extends IdentityVerificationChannel {
  public Service = new FakeService();
  public Created: Array<unknown> = [];
  public Clock = 1_000_000;
  protected override now(): number {
    return this.Clock;
  }
  protected override createVerificationClient(): GraphQLRealtimeSessionClient {
    const fake = {
      RequestVerification: (input: { AgentSessionID: string; Name: string; Email: string }) => {
        this.Created.push(input);
        return this.Service.Request({ Name: input.Name, Email: input.Email });
      },
      SubmitVerificationCode: (input: { AgentSessionID: string; Code: string }) => this.Service.SubmitCode(input.Code)
    };
    return fake as unknown as GraphQLRealtimeSessionClient;
  }
}

function context(overrides: Partial<RealtimeChannelContext> = {}) {
  const notes: string[] = [];
  const events$ = new Subject<RealtimeSessionStreamEvent>();
  const ctx: RealtimeChannelContext = {
    AgentName: 'Sage',
    Provider: {} as unknown as IMetadataProvider as unknown as GraphQLDataProvider as unknown as IMetadataProvider,
    SendContextNote: (t) => notes.push(t),
    RequestSave: vi.fn(),
    SetFocusMode: vi.fn(),
    SaveAsArtifact: async () => null,
    AgentSessionID: 'session-1',
    ExecuteServerAction: async () => null,
    SessionEvents$: events$.asObservable(),
    ...overrides
  };
  return { ctx, notes, events$ };
}

describe('IdentityVerificationChannel', () => {
  let channel: TestChannel;
  let host: ReturnType<typeof context>;

  beforeEach(() => {
    channel = new TestChannel();
    host = context();
    channel.Initialize(host.ctx);
  });
  afterEach(() => vi.useRealTimers());

  it('is resolvable from the ClassFactory by its registry ClientPluginClass key', () => {
    const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeChannelClient>(BaseRealtimeChannelClient, 'IdentityVerificationChannel');
    expect(instance).toBeInstanceOf(IdentityVerificationChannel);
    expect(IDENTITY_VERIFICATION_CHANNEL_NAME).toBe('IdentityVerification');
    expect(instance?.ChannelName).toBe('IdentityVerification');
  });

  describe('descriptor', () => {
    it('is an authored v2 descriptor: opt-in, shown on demand, state-only exposure', () => {
      const d = channel.GetDescriptor();
      expect(d).toMatchObject({ Key: 'IdentityVerification', Version: '2.0.0', DefaultAvailability: 'opt-in', DisplayPolicy: 'on-demand', MaxExposure: 'state' });
      expect(d.Instructions).toContain('only they can confirm');
    });

    it('names the nouns and the five verbs', () => {
      const d = channel.GetDescriptor();
      expect(d.Nouns.map((n) => n.Name)).toEqual(['name', 'email', 'status', 'confirmed', 'problem']);
      expect(d.Verbs.map((v) => v.Name)).toEqual(['fill', 'confirm', 'submit', 'resend', 'enter_code']);
    });

    it('lets ONLY the user invoke confirm, and both parties everything else', () => {
      const by = Object.fromEntries(channel.GetDescriptor().Verbs.map((v) => [v.Name, v.InvokableBy]));
      expect(by).toEqual({ fill: 'both', confirm: 'user', submit: 'both', resend: 'both', enter_code: 'both' });
    });

    it('declares no native tools — it is reached only through the ContextTool proxy', () => {
      expect(channel.GetToolDefinitions()).toEqual([]);
      expect(channel.ToolNamePrefix).toBe('');
      expect(channel.GetDescriptor().Verbs.every((v) => v.NativeToolName === undefined)).toBe(true);
    });

    it('keeps its state in step with its own nouns', () => {
      channel.ApplyVerb('fill', { field: 'name', value: 'Ada' }, 'agent');
      expect(channel.ValidateState()).toEqual([]);
      expect(Object.keys(channel.GetState())).toEqual(['name', 'email', 'status', 'confirmed', 'problem']);
    });

    it('has a surface and onboarding, and persists nothing (an email must not land on the channel row)', () => {
      expect(channel.HasSurface()).toBe(true);
      expect(channel.GetOnboardingDetails()?.Heading).toBe('Verify your identity');
      expect(channel.SerializeState()).toBeNull();
    });
  });

  describe('verbs', () => {
    it('routes each verb to the model', async () => {
      expect((await channel.ApplyVerb('fill', { field: 'name', value: 'Ada' }, 'user')).Success).toBe(true);
      expect((await channel.ApplyVerb('fill', { field: 'email', value: 'ada@example.com' }, 'user')).Success).toBe(true);
      expect((await channel.ApplyVerb('submit', {}, 'agent')).Success).toBe(true);
      expect(channel.Created).toEqual([{ AgentSessionID: 'session-1', Name: 'Ada', Email: 'ada@example.com' }]);
      channel.Clock += 120_000;
      expect((await channel.ApplyVerb('resend', {}, 'agent')).Success).toBe(true);
      expect((await channel.ApplyVerb('enter_code', { code: '123456' }, 'agent')).Success).toBe(true);
      expect(channel.Model.View.Status).toBe('verified');
    });

    it('refuses confirm when the AGENT calls it directly, even bypassing the runtime check', async () => {
      await channel.ApplyVerb('fill', { field: 'name', value: 'Ada' }, 'agent');
      expect(await channel.ApplyVerb('confirm', {}, 'agent')).toMatchObject({ Success: false, ErrorCode: 'not_invokable_by_agent' });
      expect(channel.Model.View.Name.Confirmed).toBe(false);
    });

    it('answers an unknown verb with a structured failure', async () => {
      expect(await channel.ApplyVerb('wire_money', {}, 'agent')).toMatchObject({ Success: false, ErrorCode: 'unknown_verb' });
    });

    it('refuses to send with no live session, and says why', async () => {
      const lone = new TestChannel();
      lone.Initialize(context({ AgentSessionID: null }).ctx);
      await lone.ApplyVerb('fill', { field: 'name', value: 'Ada' }, 'user');
      await lone.ApplyVerb('fill', { field: 'email', value: 'ada@example.com' }, 'user');
      expect(await lone.ApplyVerb('submit', {}, 'user')).toMatchObject({ Success: false, ErrorCode: 'session_not_found' });
      expect(lone.Created).toHaveLength(0);
    });
  });

  describe('open', () => {
    it('seeds what the host knows, unconfirmed, and tells the model the channel is open', async () => {
      const r = await channel.Open({ name: 'Ada', email: 'ada@example.com' });
      expect(r.Success).toBe(true);
      expect(channel.Model.View.Name).toMatchObject({ Value: 'Ada', Source: 'host', Confirmed: false });
      expect(host.notes.some((n) => n.includes('[channel:IdentityVerification') && n.includes('opened'))).toBe(true);
    });

    it('rejects seed inputs the descriptor does not declare', async () => {
      const r = await channel.Open({ phone: '555' });
      expect(r).toMatchObject({ Success: false, ErrorCode: 'invalid_params' });
    });
  });

  describe('events, output and perception', () => {
    it('streams typed events and tells the model once, coalesced, what changed', async () => {
      vi.useFakeTimers();
      const events: string[] = [];
      channel.Events$.subscribe((e) => events.push(e.Name));
      await channel.ApplyVerb('fill', { field: 'name', value: 'Ada' }, 'agent');
      await channel.ApplyVerb('fill', { field: 'email', value: 'ada@example.com' }, 'agent');
      await channel.ApplyVerb('confirm', {}, 'user');
      expect(events.filter((e) => e !== 'state_changed')).toEqual(['field_filled', 'field_filled', 'confirmed']);
      expect(host.notes).toHaveLength(0); // coalescing window still open
      await vi.advanceTimersByTimeAsync(5000);
      const stateNotes = host.notes.filter((n) => n.includes('state_changed'));
      expect(stateNotes).toHaveLength(1);
      expect(stateNotes[0]).toContain('"changes":3');
    });

    it('completes exactly once when the server says the person is verified, handing back who they are', () => {
      const outputs: Array<Record<string, unknown>> = [];
      channel.Output$.subscribe((o) => outputs.push(o.Output));
      const payload = verifiedPayload();
      host.events$.next({ Type: 'identity.verified', AgentSessionID: 'session-1', OccurredAt: payload.VerifiedAt, Payload: payload });
      host.events$.next({ Type: 'identity.verified', AgentSessionID: 'session-1', OccurredAt: payload.VerifiedAt, Payload: payload });
      expect(channel.Model.View.Status).toBe('verified');
      expect(outputs).toEqual([{ verified: true, email: 'ada@example.com', name: 'Ada Lovelace' }]);
    });

    it('ignores session events that are not a well-formed identity.verified', () => {
      host.events$.next({ Type: 'acme.thing', AgentSessionID: 'session-1', OccurredAt: 'x', Payload: {} });
      host.events$.next({ Type: 'identity.verified', AgentSessionID: 'session-1', OccurredAt: 'x', Payload: { VerifiedEmail: '' } });
      expect(channel.Model.View.Status).toBe('collecting');
    });

    it('works on a host with no session-event transport', () => {
      const bare = new TestChannel();
      const { ctx } = context({ SessionEvents$: undefined });
      expect(() => bare.Initialize(ctx)).not.toThrow();
    });

    it('stops following session events once disposed', () => {
      channel.Dispose();
      host.events$.next({ Type: 'identity.verified', AgentSessionID: 'session-1', OccurredAt: 'x', Payload: verifiedPayload() });
      expect(channel.Model.View.Status).toBe('collecting');
    });
  });
});
