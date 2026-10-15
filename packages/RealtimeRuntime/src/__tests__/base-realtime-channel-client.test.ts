import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { REALTIME_CHANNEL_LEGACY_CONTRACT_VERSION } from '@memberjunction/ai-core-plus';
import { BaseRealtimeChannelClient } from '../channels/base-realtime-channel-client';
import type { RealtimeChannelEvent, RealtimeChannelOutput } from '../channels/channel-contract-types';
import { FormChannel, LegacyEchoChannel, makeChannelContext } from './channel-test-helpers';

describe('legacy channels (v1 members only)', () => {
    it('synthesize a descriptor from tools, tab chrome and conservative defaults', () => {
        const channel = new LegacyEchoChannel();
        const d = channel.GetDescriptor();
        expect(d.Version).toBe(REALTIME_CHANNEL_LEGACY_CONTRACT_VERSION);
        expect(d.Key).toBe('Echo');
        expect(d.Verbs.map((v) => v.Name)).toEqual(['Say']);
        expect(d.Verbs[0].NativeToolName).toBe('Echo_Say');
        expect(d.DefaultAvailability).toBe('all-sessions');
        expect(d.DisplayPolicy).toBe('headless'); // no surface component
        expect(d.MaxExposure).toBe('state');
    });

    it('reach their native tool through the verb path, with the tool name unchanged', async () => {
        const channel = new LegacyEchoChannel();
        channel.Initialize(makeChannelContext());
        const result = await channel.ApplyVerb('Say', { phrase: 'hi' }, 'agent');
        expect(channel.Applied).toEqual([{ ToolName: 'Echo_Say', ArgsJson: '{"phrase":"hi"}' }]);
        expect(result.Success).toBe(true);
    });

    it('turn a failing legacy tool result into a structured verb failure', async () => {
        class Failing extends LegacyEchoChannel {
            public override ApplyAgentTool(): string {
                return JSON.stringify({ success: false, error: 'nope' });
            }
        }
        const result = await new Failing().ApplyVerb('Say', { phrase: 'x' }, 'agent');
        expect(result).toMatchObject({ Success: false, ErrorCode: 'verb_failed', Error: 'nope' });
    });

    it('default GetState parses the state of record, and is {} when there is none', () => {
        class Stateful extends LegacyEchoChannel {
            public override SerializeState(): string | null {
                return '{"a":1}';
            }
        }
        expect(new Stateful().GetState()).toEqual({ a: 1 });
        expect(new LegacyEchoChannel().GetState()).toEqual({});
    });

    it('a channel with no ToolNamePrefix/TabTitle/tools still instantiates with safe defaults', () => {
        class Bare extends BaseRealtimeChannelClient {
            public get ChannelName(): string {
                return 'Bare';
            }
        }
        const bare = new Bare();
        expect(bare.ToolNamePrefix).toBe('');
        expect(bare.GetToolDefinitions()).toEqual([]);
        expect(bare.InstanceId).toBe('1');
        // A surface is shared on its own only when its channel opts in.
        expect(bare.SurfaceShareable).toBe(false);
    });

    it('a channel that implements neither ApplyVerb nor ApplyAgentTool fails loudly instead of recursing', async () => {
        class Bare extends BaseRealtimeChannelClient {
            public get ChannelName(): string {
                return 'Bare';
            }
        }
        const result = await new Bare().ApplyVerb('X', {}, 'agent');
        expect(result.Success).toBe(false);
        expect(result.Error).toContain('implements neither');
    });
});

describe('v2 channels', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('route a native tool call to ApplyVerb by the descriptor verb name', async () => {
        const channel = new FormChannel();
        channel.Initialize(makeChannelContext());
        const out = await channel.ApplyAgentTool('SetField', JSON.stringify({ name: 'name', value: 'Ada' }));
        expect(JSON.parse(out)).toEqual({ success: true, result: { set: true } });
        expect(channel.State).toEqual({ fields: { name: 'Ada' } });
    });

    it('RecordChange assigns monotonic ids and emits state_changed immediately', () => {
        const channel = new FormChannel();
        channel.Initialize(makeChannelContext());
        const events: RealtimeChannelEvent[] = [];
        channel.Events$.subscribe((e) => events.push(e));
        expect(channel.Change()).toBe(1);
        expect(channel.Change()).toBe(2);
        expect(events.map((e) => [e.Name, e.ChangeId, e.Channel, e.Instance])).toEqual([
            ['state_changed', 1, 'Form', '1'],
            ['state_changed', 2, 'Form', '1'],
        ]);
    });

    it('RecordChange sends ONE coalesced structured note for a burst, snapshot first', () => {
        const channel = new FormChannel();
        const ctx = makeChannelContext();
        channel.Initialize(ctx);
        channel.Change();
        channel.Change();
        expect(ctx.Notes).toHaveLength(0);
        vi.advanceTimersByTime(1000);
        expect(ctx.Notes).toHaveLength(1);
        expect(ctx.Notes[0]).toMatch(/^\[channel:Form#1\] state_changed \{.*"snapshot":\{"fields":\{"name":""\}\}/);
    });

    it('Open validates inputs against the descriptor, seeds the channel, and tells the model what it holds', async () => {
        const channel = new FormChannel();
        const ctx = makeChannelContext();
        channel.Initialize(ctx);
        const bad = await channel.Open({});
        expect(bad).toMatchObject({ Success: false, ErrorCode: 'invalid_params' });
        expect(bad.Details?.[0]).toContain('title');

        const good = await channel.Open({ title: 'Signup' });
        expect(good.Success).toBe(true);
        expect(channel.Opened).toEqual({ title: 'Signup' });
        expect(ctx.Notes[0]).toBe('[channel:Form#1] opened {"state":{"fields":{"name":""}}}');
    });

    it('Open takes its snapshot as the baseline so the next change is a delta', async () => {
        const channel = new FormChannel();
        const ctx = makeChannelContext();
        channel.Initialize(ctx);
        await channel.Open({ title: 'x' });
        await channel.ApplyVerb('SetField', { name: 'name', value: 'Ada' }, 'agent');
        vi.advanceTimersByTime(1000);
        expect(ctx.Notes[1]).toContain('"delta":{"changed":{"fields":{"name":"Ada"}}');
    });

    it('Complete emits on Output$ and Events$ and notes completion to the model', () => {
        const channel = new FormChannel();
        const ctx = makeChannelContext();
        channel.Initialize(ctx);
        const outputs: RealtimeChannelOutput[] = [];
        const events: RealtimeChannelEvent[] = [];
        channel.Output$.subscribe((o) => outputs.push(o));
        channel.Events$.subscribe((e) => events.push(e));
        channel.Submit();
        expect(outputs[0]).toMatchObject({ Channel: 'Form', Instance: '1', Output: { submitted: true } });
        expect(events.map((e) => e.Name)).toContain('completed');
        expect(ctx.Notes).toContain('[channel:Form#1] completed {"submitted":true}');
    });

    it('ValidateState reports a state that drifted from its noun schema', () => {
        const channel = new FormChannel();
        channel.State = { fields: { name: 5 as unknown as string } };
        const issues = channel.ValidateState();
        expect(issues).toHaveLength(1);
        expect(issues[0]).toContain('$.fields.name');
    });

    it('Dispose completes the event streams and drops the context', () => {
        const channel = new FormChannel();
        channel.Initialize(makeChannelContext());
        let completed = false;
        channel.Events$.subscribe({ complete: () => (completed = true) });
        channel.Dispose();
        expect(completed).toBe(true);
    });
});
