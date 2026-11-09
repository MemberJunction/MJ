import { describe, it, expect } from 'vitest';
import type { JSONObject } from '@memberjunction/ai';
import { BaseRealtimeChannelClient } from '../channels/base-realtime-channel-client';
import type { RealtimeChannelEvent, RealtimeChannelVerbResult } from '../channels/channel-contract-types';
import { makeChannelContext } from './channel-test-helpers';

/** A multi-instance channel: every open creates a new instance and names it. */
class DocsChannel extends BaseRealtimeChannelClient {
    private seq = 0;
    public get ChannelName(): string {
        return 'Docs';
    }
    public override GetDescriptor() {
        return {
            Key: 'Docs',
            Version: '2.0.0',
            DisplayName: 'Docs',
            Instructions: 'Documents.',
            Nouns: [{ Name: 'docs', Description: 'Open documents', Schema: { type: 'object' } }],
            Verbs: [],
            DisplayPolicy: 'on-demand' as const,
            DefaultAvailability: 'opt-in' as const,
            MaxExposure: 'state' as const,
            MultiInstance: true,
        };
    }
    public Docs: Record<string, string> = {};
    public override GetState(): JSONObject {
        return { docs: { ...this.Docs } };
    }
    protected override OnOpen(inputs: JSONObject): RealtimeChannelVerbResult {
        const id = `d${++this.seq}`;
        this.Docs[id] = String(inputs['title'] ?? 'Untitled');
        return { Success: true, Instance: id, Result: { title: this.Docs[id] } };
    }
    public Finish(instanceId: string): void {
        this.Complete({ done: true }, instanceId);
    }
    public Announce(instanceId: string): void {
        this.EmitChannelEvent('custom', { a: 1 }, 7, instanceId);
    }
}

/** A single-instance channel that returns nothing from OnOpen (the common case). */
class SoloChannel extends BaseRealtimeChannelClient {
    public get ChannelName(): string {
        return 'Solo';
    }
}

describe('multi-instance channels: naming the instance that was opened', () => {
    it('the opened event, the note and the open result name the instance OnOpen created, not the primary one', async () => {
        const notes: string[] = [];
        const channel = new DocsChannel();
        channel.Initialize(makeChannelContext({ SendContextNote: (t: string) => notes.push(t) }));
        const events: RealtimeChannelEvent[] = [];
        channel.Events$.subscribe((e) => events.push(e));

        const first = await channel.Open({ title: 'Plan' });
        const second = await channel.Open({ title: 'Budget' });

        expect(first.Result).toMatchObject({ opened: true, channel: 'Docs', instance: 'd1', title: 'Plan' });
        expect(second.Result).toMatchObject({ instance: 'd2', title: 'Budget' });
        expect(events.filter((e) => e.Name === 'opened').map((e) => e.Instance)).toEqual(['d1', 'd2']);
        expect(notes[0]).toMatch(/^\[channel:Docs#d1\] opened /);
        expect(notes[1]).toMatch(/^\[channel:Docs#d2\] opened /);
    });

    it('Complete and EmitChannelEvent can name an instance', () => {
        const notes: string[] = [];
        const channel = new DocsChannel();
        channel.Initialize(makeChannelContext({ SendContextNote: (t: string) => notes.push(t) }));
        const events: RealtimeChannelEvent[] = [];
        const outputs: Array<{ Instance: string }> = [];
        channel.Events$.subscribe((e) => events.push(e));
        channel.Output$.subscribe((o) => outputs.push(o));

        channel.Finish('d3');
        channel.Announce('d4');

        expect(outputs[0].Instance).toBe('d3');
        expect(events.find((e) => e.Name === 'completed')?.Instance).toBe('d3');
        expect(notes[0]).toMatch(/^\[channel:Docs#d3\] completed /);
        expect(events.find((e) => e.Name === 'custom')).toMatchObject({ Instance: 'd4', ChangeId: 7, Payload: { a: 1 } });
    });

    it('a single-instance channel is unchanged: everything is addressed to its one instance', async () => {
        const notes: string[] = [];
        const channel = new SoloChannel();
        channel.Initialize(makeChannelContext({ SendContextNote: (t: string) => notes.push(t) }));
        const events: RealtimeChannelEvent[] = [];
        channel.Events$.subscribe((e) => events.push(e));
        const result = await channel.Open({});
        expect(result.Result).toMatchObject({ opened: true, channel: 'Solo', instance: channel.InstanceId });
        expect(events[0].Instance).toBe(channel.InstanceId);
        expect(notes[0]).toContain(`#${channel.InstanceId}]`);
    });

    it("a refused open names no instance and sends nothing", async () => {
        class Refusing extends SoloChannel {
            protected override OnOpen(): RealtimeChannelVerbResult {
                return { Success: false, ErrorCode: 'open_failed', Error: 'no', Instance: 'x1' };
            }
        }
        const notes: string[] = [];
        const channel = new Refusing();
        channel.Initialize(makeChannelContext({ SendContextNote: (t: string) => notes.push(t) }));
        const result = await channel.Open({});
        expect(result).toMatchObject({ Success: false, ErrorCode: 'open_failed' });
        expect(notes).toEqual([]);
    });
});
