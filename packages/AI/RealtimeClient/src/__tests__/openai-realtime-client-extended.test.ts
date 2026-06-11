/**
 * Extended OpenAI driver coverage: out-of-order / duplicate / malformed inbound frames,
 * response-state-machine edges, narration flag lifecycle, queueing under concurrency,
 * Connect failure paths, Disconnect idempotency, and the PRODUCTION seam implementations
 * (postSdpOffer via a stubbed fetch, createAudioSink via a stubbed document,
 * createPeerConnection via a stubbed RTCPeerConnection, attachRemoteAudio's ontrack).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenAIRealtimeClient } from '../drivers/openAIRealtimeClient';
import {
    collect,
    FakeDataChannel,
    FakeMediaStream,
    FakeTrack,
    makeOpenAIConfig,
    OpenAIChannelTestClient,
    OpenAIConnectTestClient,
} from './helpers/realtime-fakes';

describe('OpenAIRealtimeClient (extended)', () => {
    let channel: FakeDataChannel;
    let client: OpenAIChannelTestClient;

    beforeEach(() => {
        channel = new FakeDataChannel();
        client = new OpenAIChannelTestClient();
    });

    /** Init + open the channel and clear the session.update frame for clean send assertions. */
    function openChannel(): void {
        client.InitChannel(channel);
        channel.Open();
        channel.Sent = [];
    }

    // ── Out-of-order / duplicate / malformed inbound frames ───────────────────

    describe('inbound robustness (out-of-order, duplicate, malformed frames)', () => {
        beforeEach(openChannel);

        it('should tolerate response.done without a preceding response.created', () => {
            const { errors } = collect(client);
            expect(() => channel.EmitServer({ type: 'response.done' })).not.toThrow();
            expect(client.IsBusy).toBe(false);
            expect(errors).toEqual([]);
        });

        it('should flush a queued tool-result trigger exactly once across duplicate response.done frames', () => {
            client.RequestSpokenUpdate('narrating');
            channel.EmitServer({ type: 'response.created' });
            channel.Sent = [];

            client.SendToolResult('call_dup', '{"ok":true}');
            // only the function_call_output item so far
            expect(channel.SentEvents().map((e) => e.type)).toEqual(['conversation.item.create']);

            channel.EmitServer({ type: 'response.done' });
            channel.EmitServer({ type: 'response.done' }); // duplicate / out-of-order
            channel.EmitServer({ type: 'response.done' });

            const triggers = channel.SentEvents().filter((e) => e.type === 'response.create');
            expect(triggers).toHaveLength(1);
        });

        it('should tolerate output_audio_buffer.stopped without a preceding started', () => {
            const { states } = collect(client);
            expect(() => channel.EmitServer({ type: 'output_audio_buffer.stopped' })).not.toThrow();
            expect(client.IsAudioPlaying).toBe(false);
            // not in 'speaking', so no state emission
            expect(states).toEqual([]);
        });

        it('should keep IsAudioPlaying coherent across duplicate started/stopped frames', () => {
            channel.EmitServer({ type: 'output_audio_buffer.started' });
            channel.EmitServer({ type: 'output_audio_buffer.started' });
            expect(client.IsAudioPlaying).toBe(true);
            channel.EmitServer({ type: 'output_audio_buffer.stopped' });
            channel.EmitServer({ type: 'output_audio_buffer.stopped' });
            expect(client.IsAudioPlaying).toBe(false);
        });

        it('should ignore unknown event types without emitting anything', () => {
            const collected = collect(client);
            channel.EmitServer({ type: 'session.created' });
            channel.EmitServer({ type: 'rate_limits.updated' });
            channel.EmitServer({ type: 'response.output_item.added' });
            expect(collected.transcripts).toEqual([]);
            expect(collected.toolCalls).toEqual([]);
            expect(collected.states).toEqual([]);
            expect(collected.errors).toEqual([]);
        });

        it('should ignore valid-JSON scalar frames (null, number, string, boolean, array)', () => {
            const collected = collect(client);
            // BUG FIX REGRESSION: a bare "null" frame used to throw
            // "Cannot read properties of null (reading 'type')" inside onmessage.
            expect(() => {
                channel.EmitRaw('null');
                channel.EmitRaw('42');
                channel.EmitRaw('"hello"');
                channel.EmitRaw('true');
            }).not.toThrow();
            // an array parses to an object without a known type → default no-op
            expect(() => channel.EmitRaw('[1,2,3]')).not.toThrow();
            expect(collected.transcripts).toEqual([]);
            expect(collected.errors).toEqual([]);
            expect(client.IsBusy).toBe(false);
        });

        it('should tolerate a response.done carrying cancelled/failed status payloads', () => {
            channel.EmitServer({ type: 'response.created' });
            expect(client.IsBusy).toBe(true);
            channel.EmitServer({ type: 'response.done', response: { status: 'cancelled' } });
            expect(client.IsBusy).toBe(false);

            channel.EmitServer({ type: 'response.created' });
            channel.EmitServer({ type: 'response.done', response: { status: 'failed' } });
            expect(client.IsBusy).toBe(false);
        });

        it('should flush a queued tool result even when the blocking response ends cancelled', () => {
            client.RequestSpokenUpdate('narrating');
            channel.EmitServer({ type: 'response.created' });
            channel.Sent = [];
            client.SendToolResult('call_c', '{"ok":true}');

            channel.EmitServer({ type: 'response.done', response: { status: 'cancelled' } });
            const triggers = channel.SentEvents().filter((e) => e.type === 'response.create');
            expect(triggers).toHaveLength(1);
            expect(client.IsBusy).toBe(true);
        });
    });

    // ── Narration flag lifecycle ───────────────────────────────────────────────

    describe('narration flag lifecycle', () => {
        beforeEach(openChannel);

        it('should tag user transcripts arriving mid-narration as normal', () => {
            const { transcripts } = collect(client);
            client.RequestSpokenUpdate('progress');
            channel.EmitServer({ type: 'response.created' });
            channel.EmitServer({ type: 'conversation.item.input_audio_transcription.completed', transcript: 'wait' });
            expect(transcripts).toEqual([{ Role: 'User', Text: 'wait', IsFinal: true, Kind: 'normal' }]);
        });

        it('should tag narration transcripts via the beta event names too', () => {
            const { transcripts } = collect(client);
            client.RequestSpokenUpdate('progress');
            channel.EmitServer({ type: 'response.created' });
            channel.EmitServer({ type: 'response.audio_transcript.delta', delta: 'On it' });
            channel.EmitServer({ type: 'response.audio_transcript.done', transcript: 'On it' });
            expect(transcripts).toEqual([
                { Role: 'Assistant', Text: 'On it', IsFinal: false, Kind: 'narration' },
                { Role: 'Assistant', Text: 'On it', IsFinal: true, Kind: 'narration' },
            ]);
        });

        it('should reset the response kind on response.done even when no transcript-done frame arrived', () => {
            const { transcripts } = collect(client);
            client.RequestSpokenUpdate('progress');
            channel.EmitServer({ type: 'response.created' });
            channel.EmitServer({ type: 'response.output_audio_transcript.delta', delta: 'half-spoken' });
            channel.EmitServer({ type: 'response.done' }); // no transcript-done — e.g. cancelled mid-utterance

            // the next, ordinary turn must NOT inherit the narration kind
            channel.EmitServer({ type: 'response.created' });
            channel.EmitServer({ type: 'response.output_audio_transcript.delta', delta: 'normal turn' });
            const last = transcripts[transcripts.length - 1];
            expect(last.Kind).toBe('normal');
        });

        it('should keep IsBusy true on barge-in mid-narration until response.done arrives', () => {
            const { states } = collect(client);
            client.RequestSpokenUpdate('progress');
            channel.EmitServer({ type: 'response.created' });
            channel.EmitServer({ type: 'response.output_audio_transcript.delta', delta: 'speaking' });
            channel.EmitServer({ type: 'input_audio_buffer.speech_started' }); // barge-in
            expect(states[states.length - 1]).toBe('listening');
            expect(client.IsBusy).toBe(true); // provider cancels via its own response.done

            channel.EmitServer({ type: 'response.done' });
            expect(client.IsBusy).toBe(false);
        });

        it('should leave the pending narration flag intact for the NEXT response.created only', () => {
            const { transcripts } = collect(client);
            client.RequestSpokenUpdate('only this turn');
            channel.EmitServer({ type: 'response.created' }); // consumes the flag
            channel.EmitServer({ type: 'response.done' });
            channel.EmitServer({ type: 'response.created' }); // flag already consumed
            channel.EmitServer({ type: 'response.output_audio_transcript.done', transcript: 'plain reply' });
            expect(transcripts).toEqual([{ Role: 'Assistant', Text: 'plain reply', IsFinal: true, Kind: 'normal' }]);
        });
    });

    // ── Send queueing under concurrency ────────────────────────────────────────

    describe('send queueing under concurrency', () => {
        beforeEach(openChannel);

        it('should coalesce multiple queued result triggers into ONE response.create on flush', () => {
            client.RequestSpokenUpdate('narrating');
            channel.EmitServer({ type: 'response.created' });
            channel.Sent = [];

            client.SendToolResult('call_a', '{"a":1}');
            client.SendToolResult('call_b', '{"b":2}');
            client.SendText('and a typed message');

            // all three payload items go out immediately; no trigger yet
            const beforeFlush = channel.SentEvents();
            expect(beforeFlush.map((e) => e.type)).toEqual([
                'conversation.item.create',
                'conversation.item.create',
                'conversation.item.create',
            ]);

            channel.EmitServer({ type: 'response.done' });
            const triggers = channel.SentEvents().filter((e) => e.type === 'response.create');
            // a single response.create voices everything that queued up
            expect(triggers).toHaveLength(1);
        });

        it('should deliver each tool-result payload exactly once (never resent on later turns)', () => {
            client.SendToolResult('call_x', '{"x":true}');
            channel.EmitServer({ type: 'response.created' });
            channel.EmitServer({ type: 'response.done' });
            channel.EmitServer({ type: 'response.created' });
            channel.EmitServer({ type: 'response.done' });

            const outputs = channel
                .SentEvents()
                .filter((e) => e.type === 'conversation.item.create' && e.item?.type === 'function_call_output');
            expect(outputs).toHaveLength(1);
            expect(outputs[0].item?.call_id).toBe('call_x');
        });
    });

    // ── No-channel / not-open guards ───────────────────────────────────────────

    describe('guards when the data channel is absent or not open', () => {
        it('should no-op SendText with no channel adopted', () => {
            expect(() => client.SendText('void')).not.toThrow();
            expect(client.IsBusy).toBe(false);
        });

        it('should no-op SendContextNote with no channel adopted', () => {
            expect(() => client.SendContextNote('void')).not.toThrow();
        });

        it('should no-op RequestSpokenUpdate with no channel adopted (and stay idle)', () => {
            expect(() => client.RequestSpokenUpdate('void')).not.toThrow();
            expect(client.IsBusy).toBe(false);
        });

        it('should no-op SendToolResult with no channel adopted (and stay idle)', () => {
            expect(() => client.SendToolResult('c1', '{}')).not.toThrow();
            expect(client.IsBusy).toBe(false);
        });

        it('should drop a SendContextNote on a channel that is not yet open', () => {
            client.InitChannel(channel); // adopted but readyState 'connecting'
            client.SendContextNote('too early');
            expect(channel.Sent).toHaveLength(0);
        });

        it('LOCKS CURRENT BEHAVIOR: RequestSpokenUpdate on a non-open channel sets IsBusy without sending', () => {
            // Known quirk: RequestSpokenUpdate only guards on channel presence, not readyState.
            // The response.create is silently dropped by sendEvent, but responseActive flips
            // true with no response.done ever coming to clear it. Hosts gate narration on
            // session state, so this window (adopted-but-not-open) is not hit in practice.
            client.InitChannel(channel);
            client.RequestSpokenUpdate('too early');
            expect(channel.Sent).toHaveLength(0);
            expect(client.IsBusy).toBe(true);
        });

        it('should no-op SetMuted before any Connect (no mic stream)', () => {
            expect(() => client.SetMuted(true)).not.toThrow();
        });
    });

    // ── Error frames ───────────────────────────────────────────────────────────

    describe('error frame edge shapes', () => {
        beforeEach(openChannel);

        it('should fall back to a generic message for an error frame without an error body', () => {
            const { errors } = collect(client);
            channel.EmitServer({ type: 'error' });
            expect(errors).toEqual([{ Message: 'Unknown provider error', Code: undefined, Fatal: false }]);
        });

        it('should suppress the closed emission when the channel closes after a transport error', () => {
            const { states } = collect(client);
            channel.onerror?.(new Event('error'));
            expect(states[states.length - 1]).toBe('error');
            channel.onclose?.(new Event('close'));
            // no trailing 'closed' over the fatal error state
            expect(states.filter((s) => s === 'closed')).toEqual([]);
        });
    });

    // ── Connect failure paths + Disconnect lifecycle ───────────────────────────

    describe('Connect failure paths', () => {
        it('should reject Connect when the SDP POST fails and stay in connecting', async () => {
            const connectClient = new OpenAIConnectTestClient();
            connectClient.PostError = new Error('OpenAI WebRTC handshake failed (401): bad token');
            const { states } = collect(connectClient);

            await expect(connectClient.Connect(makeOpenAIConfig(), new FakeMediaStream([new FakeTrack()]))).rejects.toThrow(
                /handshake failed/
            );
            expect(states).toEqual(['connecting']);
            expect(connectClient.IsBusy).toBe(false);
        });

        it('should still tear down cleanly after a failed Connect', async () => {
            const connectClient = new OpenAIConnectTestClient();
            connectClient.PostError = new Error('boom');
            const track = new FakeTrack();
            await expect(connectClient.Connect(makeOpenAIConfig(), new FakeMediaStream([track]))).rejects.toThrow();

            const { states } = collect(connectClient);
            await connectClient.Disconnect();
            expect(track.Stopped).toBe(true);
            expect(connectClient.Pc.Closed).toBe(true);
            expect(states[states.length - 1]).toBe('closed');
        });

        it('should reject Connect when createOffer fails', async () => {
            const connectClient = new OpenAIConnectTestClient();
            connectClient.Pc.OfferError = new Error('no offer for you');
            await expect(connectClient.Connect(makeOpenAIConfig(), new FakeMediaStream([new FakeTrack()]))).rejects.toThrow(
                'no offer for you'
            );
        });

        it('should post an empty offer SDP when createOffer returns no sdp field', async () => {
            const connectClient = new OpenAIConnectTestClient();
            connectClient.Pc.Offer = { type: 'offer' }; // no sdp
            await connectClient.Connect(makeOpenAIConfig(), new FakeMediaStream([new FakeTrack()]));
            expect(connectClient.PostedOffers).toEqual([{ sdp: '', token: 'ek_test_123' }]);
        });
    });

    describe('Disconnect lifecycle', () => {
        it('should be idempotent — a second Disconnect must not throw and ends closed', async () => {
            const connectClient = new OpenAIConnectTestClient();
            await connectClient.Connect(makeOpenAIConfig(), new FakeMediaStream([new FakeTrack()]));
            connectClient.Pc.Channel.Open();

            await connectClient.Disconnect();
            const { states } = collect(connectClient);
            await expect(connectClient.Disconnect()).resolves.toBeUndefined();
            expect(states[states.length - 1]).toBe('closed');
            expect(connectClient.IsBusy).toBe(false);
        });

        it('should NOT emit closed when disconnecting after a fatal transport error', async () => {
            const connectClient = new OpenAIConnectTestClient();
            await connectClient.Connect(makeOpenAIConfig(), new FakeMediaStream([new FakeTrack()]));
            connectClient.Pc.Channel.Open();
            const { states } = collect(connectClient);

            connectClient.Pc.Channel.onerror?.(new Event('error'));
            expect(states[states.length - 1]).toBe('error');

            await connectClient.Disconnect();
            expect(states.filter((s) => s === 'closed')).toEqual([]);
        });

        it('should reset the full response state machine mid-call (busy, narration, queued result)', async () => {
            openChannel();
            client.RequestSpokenUpdate('narrating'); // busy + pending narration kind
            channel.EmitServer({ type: 'response.created' });
            client.SendToolResult('call_q', '{"ok":true}'); // queued result trigger
            channel.EmitServer({ type: 'output_audio_buffer.started' });
            expect(client.IsBusy).toBe(true);
            expect(client.IsAudioPlaying).toBe(true);

            await client.Disconnect();
            expect(client.IsBusy).toBe(false);
            expect(client.IsAudioPlaying).toBe(false);

            // a fresh channel sees no leakage: the next response is tagged normal and no
            // stale queued response.create fires on response.done
            const freshChannel = new FakeDataChannel();
            const { transcripts } = collect(client);
            client.InitChannel(freshChannel);
            freshChannel.Open();
            freshChannel.Sent = [];
            freshChannel.EmitServer({ type: 'response.created' });
            freshChannel.EmitServer({ type: 'response.output_audio_transcript.done', transcript: 'fresh' });
            freshChannel.EmitServer({ type: 'response.done' });
            expect(transcripts).toEqual([{ Role: 'Assistant', Text: 'fresh', IsFinal: true, Kind: 'normal' }]);
            expect(freshChannel.SentEvents().filter((e) => e.type === 'response.create')).toHaveLength(0);
        });

        it('should not send a session.update when the session config is null', () => {
            client.InitChannel(channel, null);
            channel.Open();
            expect(channel.Sent).toHaveLength(0);
        });
    });

    // ── Remote audio routing (ontrack) ─────────────────────────────────────────

    describe('remote audio routing', () => {
        it('should route the provider audio stream into the sink on ontrack', async () => {
            const connectClient = new OpenAIConnectTestClient();
            await connectClient.Connect(makeOpenAIConfig(), new FakeMediaStream([new FakeTrack()]));

            const remoteStream = new FakeMediaStream([new FakeTrack()]);
            const trackEvent = Object.assign(new Event('track'), {
                streams: [remoteStream] as ReadonlyArray<MediaStream>,
            }) as RTCTrackEvent;
            connectClient.Pc.ontrack?.(trackEvent);
            expect(connectClient.Sink.srcObject).toBe(remoteStream);
        });

        it('should ignore a track event with no stream', async () => {
            const connectClient = new OpenAIConnectTestClient();
            await connectClient.Connect(makeOpenAIConfig(), new FakeMediaStream([new FakeTrack()]));

            const trackEvent = Object.assign(new Event('track'), {
                streams: [] as ReadonlyArray<MediaStream>,
            }) as RTCTrackEvent;
            connectClient.Pc.ontrack?.(trackEvent);
            expect(connectClient.Sink.srcObject).toBeNull();
        });

        it('should be safe to receive a track event after Disconnect removed the sink', async () => {
            const connectClient = new OpenAIConnectTestClient();
            await connectClient.Connect(makeOpenAIConfig(), new FakeMediaStream([new FakeTrack()]));
            const ontrack = connectClient.Pc.ontrack;
            await connectClient.Disconnect();

            const trackEvent = Object.assign(new Event('track'), {
                streams: [new FakeMediaStream([])] as ReadonlyArray<MediaStream>,
            }) as RTCTrackEvent;
            expect(() => ontrack?.(trackEvent)).not.toThrow();
        });
    });

    // ── Production seam implementations ────────────────────────────────────────

    describe('production seams (stubbed globals)', () => {
        /** Exposes the protected production seams for direct testing. */
        class SeamExposedClient extends OpenAIRealtimeClient {
            public PostOffer(sdp: string, token: string): Promise<string> {
                return this.postSdpOffer(sdp, token);
            }
            public CreateSink(): ReturnType<OpenAIRealtimeClient['createAudioSink']> {
                return this.createAudioSink();
            }
            public CreatePc(): ReturnType<OpenAIRealtimeClient['createPeerConnection']> {
                return this.createPeerConnection();
            }
        }

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('postSdpOffer should POST raw SDP with bearer auth and return the answer SDP', async () => {
            const calls: Array<{ url: string; init: RequestInit }> = [];
            vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
                calls.push({ url, init });
                return { ok: true, status: 200, text: async () => 'ANSWER_SDP' };
            });

            const seamClient = new SeamExposedClient();
            const answer = await seamClient.PostOffer('OFFER_SDP', 'ek_secret');

            expect(answer).toBe('ANSWER_SDP');
            expect(calls).toHaveLength(1);
            // GA flow: no query params, no OpenAI-Beta header
            expect(calls[0].url).toBe('https://api.openai.com/v1/realtime/calls');
            expect(calls[0].init.method).toBe('POST');
            expect(calls[0].init.body).toBe('OFFER_SDP');
            expect(calls[0].init.headers).toEqual({
                Authorization: 'Bearer ek_secret',
                'Content-Type': 'application/sdp',
            });
        });

        it('postSdpOffer should throw with status + detail when the POST fails', async () => {
            vi.stubGlobal('fetch', async () => ({ ok: false, status: 401, text: async () => 'invalid token' }));
            const seamClient = new SeamExposedClient();
            await expect(seamClient.PostOffer('OFFER', 'bad')).rejects.toThrow(
                'OpenAI WebRTC handshake failed (401): invalid token'
            );
        });

        it('postSdpOffer should tolerate an unreadable error body', async () => {
            vi.stubGlobal('fetch', async () => ({
                ok: false,
                status: 500,
                text: async () => {
                    throw new Error('body stream broken');
                },
            }));
            const seamClient = new SeamExposedClient();
            await expect(seamClient.PostOffer('OFFER', 'tok')).rejects.toThrow('OpenAI WebRTC handshake failed (500): ');
        });

        it('createAudioSink should append a hidden autoplaying <audio> element', () => {
            interface FakeAudioEl {
                autoplay: boolean;
                style: { display: string };
                srcObject: MediaProvider | null;
                remove(): void;
            }
            const created: FakeAudioEl[] = [];
            const appended: FakeAudioEl[] = [];
            vi.stubGlobal('document', {
                createElement: (tag: string): FakeAudioEl => {
                    expect(tag).toBe('audio');
                    const el: FakeAudioEl = { autoplay: false, style: { display: '' }, srcObject: null, remove: () => {} };
                    created.push(el);
                    return el;
                },
                body: { appendChild: (el: FakeAudioEl) => appended.push(el) },
            });

            const seamClient = new SeamExposedClient();
            const sink = seamClient.CreateSink();
            expect(created).toHaveLength(1);
            expect(appended[0]).toBe(created[0]);
            expect(created[0].autoplay).toBe(true);
            expect(created[0].style.display).toBe('none');
            expect(sink.srcObject).toBeNull();
        });

        it('createPeerConnection should construct a real RTCPeerConnection', () => {
            class FakeRTCPeerConnection {}
            vi.stubGlobal('RTCPeerConnection', FakeRTCPeerConnection);
            const seamClient = new SeamExposedClient();
            expect(seamClient.CreatePc()).toBeInstanceOf(FakeRTCPeerConnection);
        });
    });
});
