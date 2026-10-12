import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WidgetKeyError } from '../lib/auth/widget-key-client';
import { START_DROPPED_MESSAGE, CONNECTION_LOST_MESSAGE, DescribeStartError } from '../lib/session/widget-controller';
import {
  FakeGuestSessions,
  SESSION_ID,
  WidgetFakeClient,
  buildHarness,
  flush,
  guestSession,
  makeJwt,
  makeTestChannelClass,
  spyConsole,
  type Harness
} from './widget-test-kit';

const phases = (h: Harness) => h.phases();

describe('WidgetController', () => {
  beforeEach(() => {
    WidgetFakeClient.Notes = [];
    WidgetFakeClient.Spoken = [];
    WidgetFakeClient.ConnectError = null;
    spyConsole();
  });
  afterEach(() => vi.restoreAllMocks());

  describe('ready and auto-start', () => {
    it('announces ready once, on a microtask, with the resolved mode', async () => {
      const h = buildHarness({ widgetKey: 'pk', apiUrl: 'https://api.example.com' });
      h.controller.Ready();
      h.controller.Ready();
      expect(h.eventNames()).toEqual([]); // not synchronously: a page that attaches its listener in the same tick still hears it
      await flush();
      expect(h.events).toEqual([{ name: 'mj-ready', detail: { mode: 'widget-key', autoStart: false } }]);
    });

    it('starts by itself when auto-start is on', async () => {
      const h = buildHarness({ autoStart: true, token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com' });
      h.controller.Ready();
      await flush();
      await vi.waitFor(() => expect(h.controller.Phase).toBe('live'));
    });

    it('does not start by itself otherwise', async () => {
      const h = buildHarness({ token: makeJwt(9_999_999_999), agentId: 'agent-1' });
      h.controller.Ready();
      await flush();
      expect(h.controller.Phase).toBe('idle');
    });
  });

  describe('consent', () => {
    it('shows the consent gate first and starts NOTHING — no mint, no microphone — until the visitor accepts', async () => {
      const h = buildHarness({ requireConsent: true, token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com' });
      await h.controller.Start();
      expect(h.controller.Phase).toBe('consent');
      expect(h.provider.mints()).toHaveLength(0);
      expect((h.runtime as unknown as { mediaHost: { MicAcquisitions: number } }).mediaHost.MicAcquisitions).toBe(0);
      expect(h.authProvider.Held).toHaveLength(0);
    });

    it('declining returns to idle with nothing started', async () => {
      const h = buildHarness({ requireConsent: true, token: makeJwt(9_999_999_999), agentId: 'agent-1' });
      await h.controller.Start();
      h.controller.DeclineConsent();
      expect(h.controller.Phase).toBe('idle');
      expect(h.provider.mints()).toHaveLength(0);
    });

    it('accepting starts the call — and never records (the widget offers no recording)', async () => {
      const h = buildHarness({ requireConsent: true, token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com' });
      await h.controller.Start();
      await h.controller.AcceptConsent(false);
      expect(h.controller.Phase).toBe('live');
      expect(h.provider.mints()[0].variables['recordingConsent']).toBe(false);
    });

    it('asks again after a call ends', async () => {
      const h = buildHarness({ requireConsent: true, token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com' });
      await h.controller.Start();
      await h.controller.AcceptConsent(false);
      await h.controller.End();
      await h.controller.Start();
      expect(h.controller.Phase).toBe('consent');
    });

    it('ignores accept/decline outside the consent phase', async () => {
      const h = buildHarness({ token: makeJwt(9_999_999_999), agentId: 'agent-1' });
      await h.controller.AcceptConsent(true);
      h.controller.DeclineConsent();
      expect(h.controller.Phase).toBe('idle');
      expect(h.provider.mints()).toHaveLength(0);
    });
  });

  describe('a normal call', () => {
    async function liveCall(overrides = {}) {
      const h = buildHarness({ token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com', applicationId: 'app-9', conversationId: 'conv-9', ...overrides });
      await h.controller.Start();
      return h;
    }

    it('walks booting → connecting → live and tells the page about each phase', async () => {
      const h = await liveCall();
      expect(phases(h)).toEqual(['booting', 'connecting', 'live']);
      expect(h.events.filter((e) => e.name === 'mj-phase-changed').map((e) => e.detail)).toEqual([
        { phase: 'booting', previous: 'idle' },
        { phase: 'connecting', previous: 'booting' },
        { phase: 'live', previous: 'connecting' }
      ]);
    });

    it('mints for the configured agent, application and conversation', async () => {
      const h = await liveCall();
      expect(h.provider.mints()[0].variables).toMatchObject({ targetAgentId: 'agent-1', applicationId: 'app-9', conversationId: 'conv-9' });
    });

    it('announces the session with its id, agent and conversation', async () => {
      const h = await liveCall();
      expect(h.events.find((e) => e.name === 'mj-session-started')?.detail).toEqual({ sessionId: SESSION_ID, agentId: 'agent-1', conversationId: 'conv-9', channels: [] });
    });

    it('arms the tab-close handler for the live session and disarms it when the call ends', async () => {
      const h = await liveCall();
      expect(h.controller.OnPageHide(false)).toBe(true);
      expect(h.closes).toEqual([{ url: 'https://api.example.com/', token: 'live-token', sessionId: SESSION_ID }]);
    });

    it('does not close the call on a pagehide into the back/forward cache', async () => {
      const h = await liveCall();
      expect(h.controller.OnPageHide(true)).toBe(false);
      expect(h.closes).toHaveLength(0);
    });

    it('ends on request: ended phase, one session-ended event with reason "user", and no tab-close left armed', async () => {
      const h = await liveCall();
      await h.controller.End();
      expect(h.controller.Phase).toBe('ended');
      expect(h.events.filter((e) => e.name === 'mj-session-ended').map((e) => e.detail)).toEqual([{ sessionId: SESSION_ID, reason: 'user' }]);
      expect(h.controller.OnPageHide(false)).toBe(false);
    });

    it('treats the overlay\'s own End as the visitor ending it', async () => {
      const h = await liveCall();
      h.controller.NotifyOverlayEnded();
      await h.runtime.EndRealtimeSession(); // what the overlay's End button does
      expect(h.events.find((e) => e.name === 'mj-session-ended')?.detail).toMatchObject({ reason: 'user' });
    });

    it('reports a page-close ending as such', async () => {
      const h = await liveCall();
      h.controller.OnPageHide(false);
      await h.runtime.EndRealtimeSession();
      expect(h.events.find((e) => e.name === 'mj-session-ended')?.detail).toMatchObject({ reason: 'page-close' });
    });

    it('reports a connection that dropped mid-call, with the right words', async () => {
      const h = await liveCall();
      WidgetFakeClient.Instance!.Drop();
      expect(h.controller.Phase).toBe('error');
      expect(h.controller.ErrorMessage).toBe(CONNECTION_LOST_MESSAGE);
      expect(h.events.find((e) => e.name === 'mj-error')?.detail).toMatchObject({ code: 'connection-lost' });
    });

    it('can start again after ending, ignoring the previous session\'s replayed final state', async () => {
      const h = await liveCall();
      await h.controller.End();
      await h.controller.Start();
      expect(h.controller.Phase).toBe('live');
      expect(h.provider.mints()).toHaveLength(2);
    });

    it('ignores a start while a call is starting or live', async () => {
      const h = await liveCall();
      await h.controller.Start();
      expect(h.provider.mints()).toHaveLength(1);
    });

    it('chains the next session to the last one this tab ran', async () => {
      const h = await liveCall();
      await h.controller.End();
      await h.controller.Start();
      expect(h.provider.mints()[1].variables['lastSessionId']).toBe(SESSION_ID);
    });
  });

  describe('failures never dead-end', () => {
    it('reports a mint failure with the error in words and moves to the error phase', async () => {
      const h = buildHarness({ token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com' });
      h.provider.MintError = new Error('Realtime is not enabled for this agent');
      await h.controller.Start();
      expect(h.controller.Phase).toBe('error');
      expect(h.controller.ErrorMessage).toContain('Realtime is not enabled');
      expect(h.events.find((e) => e.name === 'mj-error')?.detail).toMatchObject({ code: 'start-failed' });
    });

    it('explains a blocked microphone in terms the visitor can act on', async () => {
      const h = buildHarness({ token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com' });
      const denied = new Error('Permission denied');
      denied.name = 'NotAllowedError';
      (h.runtime as unknown as { mediaHost: { Deny: Error } }).mediaHost.Deny = denied;
      await h.controller.Start();
      expect(h.controller.Phase).toBe('error');
      expect(h.controller.ErrorMessage).toContain('Microphone access was blocked');
    });

    it('offers retry after an error: a second start works', async () => {
      const h = buildHarness({ token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com' });
      h.provider.MintError = new Error('boom');
      await h.controller.Start();
      h.provider.MintError = null;
      await h.controller.Start();
      expect(h.controller.Phase).toBe('live');
      expect(h.controller.ErrorMessage).toBe('');
    });

    it('surfaces a start the runtime silently dropped instead of spinning forever', async () => {
      const h = buildHarness({ token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com' });
      vi.spyOn(h.runtime, 'StartRealtimeSession').mockResolvedValue(undefined); // refuses with no state change, as it does while a teardown is unfinished
      await h.controller.Start();
      expect(h.controller.Phase).toBe('error');
      expect(h.controller.ErrorMessage).toBe(START_DROPPED_MESSAGE);
      expect(h.events.find((e) => e.name === 'mj-error')?.detail).toMatchObject({ code: 'start-dropped' });
    });

    it('explains a driver that cannot connect', async () => {
      const h = buildHarness({ token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com' });
      WidgetFakeClient.ConnectError = new Error('The realtime provider is unreachable');
      await h.controller.Start();
      expect(h.controller.Phase).toBe('error');
      expect(h.controller.ErrorMessage).toContain('unreachable');
    });

    it('DescribeStartError speaks plainly for the common causes and falls back to the error text', () => {
      const notFound = new Error('Requested device not found');
      expect(DescribeStartError(notFound)).toContain('No microphone');
      expect(DescribeStartError(new Error('Something specific'))).toBe('Something specific');
      expect(DescribeStartError(new Error(''))).toBe(CONNECTION_LOST_MESSAGE);
      expect(DescribeStartError(null)).toBe(CONNECTION_LOST_MESSAGE);
    });

    it('needs an agent for token, invite and host modes', async () => {
      const h = buildHarness({ token: makeJwt(9_999_999_999), apiUrl: 'https://api.example.com' });
      await h.controller.Start();
      expect(h.events.find((e) => e.name === 'mj-error')?.detail).toMatchObject({ code: 'no-agent' });
      const host = buildHarness({});
      host.authProvider.Configured = true;
      await host.controller.Start();
      expect(host.events.find((e) => e.name === 'mj-error')?.detail).toMatchObject({ code: 'no-agent' });
    });

    it('host mode with no authenticated provider says what is missing', async () => {
      const h = buildHarness({ agentId: 'agent-1' });
      await h.controller.Start();
      expect(h.events.find((e) => e.name === 'mj-error')?.detail).toMatchObject({ code: 'no-credential' });
    });
  });

  describe('widget-key mode (anonymous guest)', () => {
    const base = { widgetKey: 'pk_live_abc', apiUrl: 'https://api.example.com' };

    it('mints a guest session over the existing endpoint, holds its token, and runs the PINNED agent in the server\'s application', async () => {
      const h = buildHarness(base);
      h.guest.Next = guestSession({ token: makeJwt(9_999_999_999), pinnedAgentId: 'agent-pinned', applicationId: 'app-server' });
      await h.controller.Start();
      expect(h.guest.Mints).toBe(1);
      expect(h.authProvider.Held).toEqual([(h.guest.Next as { token: string }).token]);
      expect(h.provider.mints()[0].variables).toMatchObject({ targetAgentId: 'agent-pinned', applicationId: 'app-server' });
      expect(h.controller.Phase).toBe('live');
    });

    it('ignores an agent-id the server did not pin, and says so', async () => {
      const h = buildHarness({ ...base, agentId: 'someone-else' });
      await h.controller.Start();
      expect(h.provider.mints()[0].variables['targetAgentId']).toBe('agent-pinned');
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('agent-id "someone-else" ignored'));
    });

    it('refuses a widget that is not enabled for voice', async () => {
      const h = buildHarness(base);
      h.guest.Next = guestSession({ modality: 'Text' });
      await h.controller.Start();
      expect(h.events.find((e) => e.name === 'mj-error')?.detail).toMatchObject({ code: 'voice-not-enabled' });
      expect(h.provider.mints()).toHaveLength(0);
    });

    it('reports the server\'s rejection of the key (uniformly, so keys cannot be probed)', async () => {
      const h = buildHarness(base);
      h.guest.Next = new WidgetKeyError('This widget is not available here.', 'origin_not_allowed', 403);
      await h.controller.Start();
      expect(h.controller.Phase).toBe('error');
      expect(h.controller.ErrorMessage).toBe('This widget is not available here.');
      expect(h.events.find((e) => e.name === 'mj-error')?.detail).toMatchObject({ code: 'auth-failed' });
      expect(h.provider.mints()).toHaveLength(0);
    });

    it('needs the api-url of the server that issued the key', async () => {
      const h = buildHarness({ widgetKey: 'pk' });
      await h.controller.Start();
      expect(h.events.find((e) => e.name === 'mj-error')?.detail).toMatchObject({ code: 'no-credential' });
    });

    it('declares the channels the widget instance enables, plus those the page lists', async () => {
      const h = buildHarness({ ...base, channels: ['Media'] });
      h.guest.Next = guestSession({ token: makeJwt(9_999_999_999), enabledChannels: ['IdentityVerification'] });
      const start = vi.spyOn(h.runtime, 'StartRealtimeSession');
      await h.controller.Start();
      const options = start.mock.calls[0][12];
      expect(options?.HostChannels?.map((c) => c.ClientPluginClass)).toEqual(['RealtimeMediaChannel', 'IdentityVerificationChannel']);
    });

    it('sets the client deadline from the server\'s voice ceiling, so the call can end gracefully before the janitor does', async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
      try {
        const h = buildHarness(base);
        h.guest.Next = guestSession({ token: makeJwt(9_999_999_999), voiceMaxSessionMinutes: 10 });
        await h.controller.Start();
        expect(h.runtime.SessionDeadline?.getTime()).toBe(Date.now() + 10 * 60_000);
        await vi.advanceTimersByTimeAsync(10 * 60_000 + 1);
        expect(h.controller.Phase).toBe('ended');
        expect(h.events.find((e) => e.name === 'mj-session-ended')?.detail).toMatchObject({ reason: 'deadline' });
      } finally {
        vi.useRealTimers();
      }
    });

    it('extends the deadline when the server announces a verification, so the call survives the original ceiling', async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
      try {
        const h = buildHarness(base);
        h.guest.Next = guestSession({ token: makeJwt(9_999_999_999), voiceMaxSessionMinutes: 10 });
        await h.controller.Start();
        h.provider.Publish('identity.verified', {
          VerifiedEmail: 'ada@example.com',
          VerifiedName: 'Ada',
          VerifiedAt: new Date().toISOString(),
          Method: 'code',
          MaxSessionDeadlineIso: new Date(Date.now() + 30 * 60_000).toISOString()
        });
        await vi.advanceTimersByTimeAsync(10 * 60_000 + 1);
        expect(h.controller.Phase).toBe('live'); // past the old ceiling, still on the call
        await vi.advanceTimersByTimeAsync(21 * 60_000);
        expect(h.controller.Phase).toBe('ended');
      } finally {
        vi.useRealTimers();
      }
    });

    it('gives the provider a renewer that asks the server\'s refresh path and holds the new token', async () => {
      const h = buildHarness(base);
      await h.controller.Start();
      const renewed = guestSession({ token: makeJwt(9_999_999_999), expiresAtMs: Date.now() + 7_200_000 });
      h.guest.Next = renewed;
      expect(await h.authProvider.Refreshers[0]()).toBe(renewed.token);
      expect(h.guest.Refreshes).toBe(1);
    });
  });

  describe('invite-token mode', () => {
    const base = { inviteToken: 'mj_ml_secret', agentId: 'agent-1', apiUrl: 'https://api.example.com' };

    it('redeems the invite once and runs the call on the redeemed session', async () => {
      const h = buildHarness(base);
      await h.controller.Start();
      expect(h.posts).toHaveLength(1);
      expect(h.posts[0].body).toEqual({ token: 'mj_ml_secret' });
      expect(h.controller.Phase).toBe('live');
      expect(h.authProvider.Held[0]).not.toBe('mj_ml_secret');
    });

    it('after a reload spends the remembered session instead of the (now spent) single-use invite', async () => {
      const h = buildHarness(base);
      await h.controller.Start();
      await h.controller.End();
      h.authProvider.Configured = false; // a reload: a fresh page holds no principal
      await h.controller.Start();
      expect(h.posts).toHaveLength(1); // redeemed ONCE
      expect(h.authProvider.Held).toHaveLength(2);
      expect(h.authProvider.Held[1]).toBe(h.authProvider.Held[0]);
    });

    it('tells the visitor why a spent or expired link did not work', async () => {
      const h = buildHarness(base);
      h.PostAnswer = { ok: false, json: { success: false, errorCode: 'expired' } };
      await h.controller.Start();
      expect(h.controller.Phase).toBe('error');
      expect(h.controller.ErrorMessage).toContain('expired');
      expect(h.events.find((e) => e.name === 'mj-error')?.detail).toMatchObject({ code: 'auth-failed' });
    });
  });

  describe('token mode', () => {
    it('holds the JWT directly, with no redemption', async () => {
      const jwt = makeJwt(9_999_999_999);
      const h = buildHarness({ token: jwt, agentId: 'agent-1', apiUrl: 'https://api.example.com' });
      await h.controller.Start();
      expect(h.posts).toHaveLength(0);
      expect(h.authProvider.Held).toEqual([jwt]);
    });

    it('cannot renew a token it was handed: the provider\'s renewer rejects honestly', async () => {
      const h = buildHarness({ token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com' });
      await h.controller.Start();
      await expect(h.authProvider.Refreshers[0]()).rejects.toThrow('expired');
    });
  });

  describe('launcher mode', () => {
    it('mints through the host\'s launcher instead of the stock mutation, with no agent-id required', async () => {
      const result = { AgentSessionId: SESSION_ID, ConversationId: null, Provider: 'widget-fake-provider', Model: 'm', EphemeralToken: 't', ExpiresAt: '2030-01-01T00:00:00Z', SessionConfigJson: '{}', ModelName: null, NarrationInstructionsTemplate: null, PriorChannelStatesJson: null };
      const launch = vi.fn(async () => result);
      const h = buildHarness({ launcher: { Launch: launch } });
      await h.controller.Start();
      expect(launch).toHaveBeenCalledTimes(1);
      expect(h.provider.mints()).toHaveLength(0);
      expect(h.controller.Phase).toBe('live');
    });

    it('reports a launcher that fails as such', async () => {
      const h = buildHarness({
        launcher: {
          Launch: async () => {
            throw new Error('guest exchange refused');
          }
        }
      });
      await h.controller.Start();
      expect(h.controller.Phase).toBe('error');
      expect(h.controller.ErrorMessage).toContain('guest exchange refused');
      expect(h.events.find((e) => e.name === 'mj-error')?.detail).toMatchObject({ code: 'launcher-failed' });
    });

    it('also holds a credential when the page supplies one alongside the launcher', async () => {
      const jwt = makeJwt(9_999_999_999);
      const result = { AgentSessionId: SESSION_ID, ConversationId: null, Provider: 'widget-fake-provider', Model: 'm', EphemeralToken: 't', ExpiresAt: '2030-01-01T00:00:00Z', SessionConfigJson: '{}', ModelName: null, NarrationInstructionsTemplate: null, PriorChannelStatesJson: null };
      const h = buildHarness({ launcher: { Launch: async () => result }, token: jwt, apiUrl: 'https://api.example.com' });
      await h.controller.Start();
      expect(h.authProvider.Held).toEqual([jwt]);
    });
  });

  describe('channels', () => {
    function started(h: Harness) {
      return vi.spyOn(h.runtime, 'StartRealtimeSession');
    }

    it('declares nothing beyond the registry when the page lists no channels', async () => {
      const h = buildHarness({ token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com' });
      const start = started(h);
      await h.controller.Start();
      expect(start.mock.calls[0][12]?.HostChannels).toEqual([]);
    });

    it('maps built-in names to their ClassFactory keys and passes anything else through as a key', async () => {
      const h = buildHarness({ token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com', channels: ['IdentityVerification', 'Whiteboard', 'AcmeCustomChannel'] });
      const start = started(h);
      await h.controller.Start();
      expect(start.mock.calls[0][12]?.HostChannels?.map((c) => c.ClientPluginClass)).toEqual(['IdentityVerificationChannel', 'RealtimeWhiteboardChannel', 'AcmeCustomChannel']);
    });

    it('a channel class the page registered is declared by factory — listed or not — and wins over a built-in of the same name', async () => {
      const Panel = makeTestChannelClass('TestPanel');
      const h = buildHarness({ token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com' });
      h.controller.RegisterChannel(Panel);
      const start = started(h);
      await h.controller.Start();
      const declared = start.mock.calls[0][12]?.HostChannels ?? [];
      expect(declared).toHaveLength(1);
      expect(declared[0].Create?.()).toBeInstanceOf(Panel);
    });

    it('rejects a channel class with no name', () => {
      const h = buildHarness();
      class Nameless {
        public get ChannelName(): string {
          return '  ';
        }
      }
      expect(() => h.controller.RegisterChannel(Nameless as never)).toThrow('no ChannelName');
    });

    it('opens a channel on request in the live call and relays its typed events, opening and output to the page', async () => {
      const Panel = makeTestChannelClass('TestPanel');
      const h = buildHarness({ token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com' });
      h.controller.RegisterChannel(Panel);
      await h.controller.Start();
      const result = await h.controller.OpenChannel('TestPanel', { title: 'Hello' });
      expect(result.success).toBe(true);
      expect(Panel.Instances.at(-1)!.OpenedWith).toEqual({ title: 'Hello' });
      expect(h.events.find((e) => e.name === 'mj-channel-opened')?.detail).toMatchObject({ channel: 'TestPanel', inputs: { title: 'Hello' } });

      Panel.Instances.at(-1)!.EmitForTest('thing_happened');
      expect(h.events.find((e) => e.name === 'mj-channel-event' && e.detail.name === 'thing_happened')?.detail).toMatchObject({ channel: 'TestPanel' });

      Panel.Instances.at(-1)!.FinishForTest();
      expect(h.events.find((e) => e.name === 'mj-channel-output')?.detail).toMatchObject({ channel: 'TestPanel', output: { done: true } });
    });

    it('reports a structured failure for invalid inputs and for a channel that is not in the session', async () => {
      const Panel = makeTestChannelClass('TestPanel');
      const h = buildHarness({ token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com' });
      h.controller.RegisterChannel(Panel);
      await h.controller.Start();
      expect(await h.controller.OpenChannel('TestPanel', { nope: 1 })).toMatchObject({ success: false, errorCode: 'invalid_params' });
      expect(await h.controller.OpenChannel('Ghost')).toMatchObject({ success: false, errorCode: 'unknown_channel' });
    });

    it('refuses to open a channel when no call is live', async () => {
      const h = buildHarness();
      expect(await h.controller.OpenChannel('TestPanel')).toMatchObject({ success: false, errorCode: 'no_session' });
    });

    it('opens the channels the page seeded with channel-inputs once the call is live, and reports a failure as an error event', async () => {
      const Panel = makeTestChannelClass('TestPanel');
      const h = buildHarness({
        token: makeJwt(9_999_999_999),
        agentId: 'agent-1',
        apiUrl: 'https://api.example.com',
        channelInputs: { TestPanel: { title: 'Seeded' }, Ghost: {} }
      });
      h.controller.RegisterChannel(Panel);
      await h.controller.Start();
      await vi.waitFor(() => expect(Panel.Instances.at(-1)!.OpenedWith).toEqual({ title: 'Seeded' }));
      await vi.waitFor(() => expect(h.events.find((e) => e.name === 'mj-error' && e.detail.code === 'channel-failed')).toBeDefined());
      expect(h.controller.Phase).toBe('live'); // a channel failing to open does not take the call down
    });

    it('describes the channels the call has, for a host UI', async () => {
      const Panel = makeTestChannelClass('TestPanel');
      const h = buildHarness({ token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com' });
      h.controller.RegisterChannel(Panel);
      await h.controller.Start();
      expect(h.controller.GetChannelDescriptors().map((d) => d.Key)).toEqual(['TestPanel']);
    });
  });

  describe('session events', () => {
    it('relays every session event, and a typed verified event for identity.verified (with the recovered flag)', async () => {
      const h = buildHarness({ token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com' });
      await h.controller.Start();
      h.provider.Publish('identity.verified', { VerifiedEmail: 'ada@example.com', VerifiedName: 'Ada', VerifiedAt: '2030-01-01T00:00:00Z', Method: 'code', MaxSessionDeadlineIso: '2031-01-01T00:00:00Z' });
      h.provider.Publish('acme.thing', { a: 1 });
      expect(h.events.filter((e) => e.name === 'mj-session-event').map((e) => e.detail.type)).toEqual(['identity.verified', 'acme.thing']);
      expect(h.events.find((e) => e.name === 'mj-verified')?.detail).toEqual({
        sessionId: SESSION_ID,
        email: 'ada@example.com',
        name: 'Ada',
        verifiedAt: '2030-01-01T00:00:00Z',
        method: 'code',
        maxSessionDeadline: '2031-01-01T00:00:00Z',
        recovered: false
      });
      expect(h.events.filter((e) => e.name === 'mj-verified')).toHaveLength(1);
    });
  });

  describe('host actions', () => {
    it('forwards context notes and spoken responses to the live agent, and reports whether the request was delivered', async () => {
      const h = buildHarness({ token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com' });
      expect(h.controller.RequestSpokenResponse('hi')).toBe(false); // no call yet
      h.controller.SendContextNote('ignored'); // no-op, no throw
      await h.controller.Start();
      h.controller.SendContextNote('The user is on the pricing page.');
      expect(WidgetFakeClient.Notes).toContain('The user is on the pricing page.');
      expect(h.controller.RequestSpokenResponse('Say hello.')).toBe(true);
      expect(WidgetFakeClient.Spoken).toContain('Say hello.');
    });
  });

  describe('surface channels', () => {
    it('reports when a channel that renders something is open, and clears it when the call ends', async () => {
      const Panel = makeTestChannelClass('TestPanel');
      Object.defineProperty(Panel.prototype, 'GetSurfaceComponent', { value: () => class FakeSurface {} });
      const h = buildHarness({ token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com' });
      h.controller.RegisterChannel(Panel);
      const seen: boolean[] = [];
      h.controller.SurfaceChannelOpen$.subscribe((v) => seen.push(v));
      await h.controller.Start();
      await h.controller.OpenChannel('TestPanel', {});
      await h.controller.End();
      expect(seen).toEqual([false, true, false]);
    });
  });

  describe('dispose', () => {
    it('never hangs up a call it did not start: an idle widget ending or being removed leaves the shared runtime alone', async () => {
      const h = buildHarness({ token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com' });
      const end = vi.spyOn(h.runtime, 'EndRealtimeSession');
      await h.controller.End();
      h.controller.Dispose();
      expect(end).not.toHaveBeenCalled();
    });

    it('ends only once: a call it did start is hung up by end(), and a later removal does not hang up again', async () => {
      const h = buildHarness({ token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com' });
      await h.controller.Start();
      const end = vi.spyOn(h.runtime, 'EndRealtimeSession');
      await h.controller.End();
      h.controller.Dispose();
      expect(end).toHaveBeenCalledTimes(1);
    });

    it('ends a live call, closes the tab-close handler, and goes silent', async () => {
      const h = buildHarness({ token: makeJwt(9_999_999_999), agentId: 'agent-1', apiUrl: 'https://api.example.com' });
      await h.controller.Start();
      const before = h.events.length;
      h.controller.Dispose();
      await flush();
      expect(h.closes).toHaveLength(1); // the element left the page with a call up
      expect(h.runtime.IsActive).toBe(false);
      expect(h.events.length).toBe(before);
      await expect(h.controller.Start()).resolves.toBeUndefined(); // inert afterwards
    });

    it('abandons a launch whose element went away mid-flight, closing any session it opened', async () => {
      const h = buildHarness({ widgetKey: 'pk', apiUrl: 'https://api.example.com' });
      let release: () => void = () => undefined;
      h.guest.Mint = () => new Promise((resolve) => (release = () => resolve(guestSession({ token: makeJwt(9_999_999_999) }))));
      const starting = h.controller.Start();
      h.controller.Dispose();
      release();
      await starting;
      expect(h.provider.mints()).toHaveLength(0); // never reached the mint
    });
  });
});

describe('WidgetController — one controller, many guest sessions', () => {
  it('re-mints a guest session on every start', async () => {
    spyConsole();
    const h = buildHarness({ widgetKey: 'pk', apiUrl: 'https://api.example.com' });
    h.guest = h.guest as FakeGuestSessions;
    await h.controller.Start();
    await h.controller.End();
    h.authProvider.Configured = false;
    await h.controller.Start();
    expect(h.guest.Mints).toBe(2);
  });
});
