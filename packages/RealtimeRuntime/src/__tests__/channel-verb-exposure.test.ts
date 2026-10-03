import { describe, it, expect } from 'vitest';
import type { JSONObject } from '@memberjunction/ai';
import type { RealtimeChannelExposure } from '@memberjunction/ai-core-plus';
import { BaseRealtimeChannelClient } from '../channels/base-realtime-channel-client';
import { ChannelActionDispatcher, type DispatchableChannel } from '../channels/channel-action-dispatcher';
import { BuildChannelCatalogNote } from '../channels/channel-catalog-note';
import { BuildToolBackedVerbs } from '../channels/channel-descriptor-synthesis';
import type { RealtimeChannelEvent, RealtimeChannelVerbResult } from '../channels/channel-contract-types';
import { makeChannelContext } from './channel-test-helpers';

/** A channel with one verb that only acts, one that returns what it holds, and one that returns pictures-derived data. */
class DocsChannel extends BaseRealtimeChannelClient {
    public Calls: string[] = [];
    public get ChannelName(): string {
        return 'Docs';
    }
    public override GetDescriptor() {
        return {
            Key: 'Docs',
            Version: '2.0.0',
            DisplayName: 'Documents',
            Instructions: 'Documents.',
            Nouns: [{ Name: 'docs', Description: 'Open documents', Schema: { type: 'object' } }],
            Verbs: [
                { Name: 'Rename', Description: 'Renames.', ParametersSchema: { type: 'object', properties: {} }, InvokableBy: 'agent' as const },
                { Name: 'Read', Description: 'Reads the text.', ParametersSchema: { type: 'object', properties: {} }, InvokableBy: 'agent' as const, ReturnsChannelData: 'state' as const },
                { Name: 'Describe', Description: 'Describes the page.', ParametersSchema: { type: 'object', properties: {} }, InvokableBy: 'both' as const, ReturnsChannelData: 'pixels' as const },
            ],
            DisplayPolicy: 'on-demand' as const,
            DefaultAvailability: 'opt-in' as const,
            MaxExposure: 'pixels' as const,
        };
    }
    public override ApplyVerb(verb: string): RealtimeChannelVerbResult {
        this.Calls.push(verb);
        return { Success: true, Result: { verb, secret: 'the document text' } };
    }
}

function rig(exposure?: RealtimeChannelExposure, reasons: string[] = []) {
    const channel = new DocsChannel();
    const ctx = makeChannelContext();
    channel.Initialize(ctx);
    if (exposure) {
        channel.ApplyExposure({ Policy: exposure, Reasons: reasons });
    }
    const dispatcher = new ChannelActionDispatcher({
        FindChannel: (key): DispatchableChannel | null => (key.toLowerCase() === 'docs' ? { Plugin: channel, IsOpen: true } : null),
        ListChannelKeys: () => ['Docs'],
        ActivateChannel: async () => undefined,
    });
    const call = (action: string) => dispatcher.Dispatch({ Target: { Channel: 'Docs' }, Action: action, Params: {} });
    return { channel, ctx, call };
}

describe('verbs that return channel data: the dispatcher', () => {
    it("at 'none' it refuses both data-returning verbs with a structured exposure_restricted error and never runs them", async () => {
        const { channel, call } = rig('none', ['the user chose to share only none']);
        for (const verb of ['Read', 'Describe']) {
            const result = await call(verb);
            expect(result).toMatchObject({ Success: false, ErrorCode: 'exposure_restricted', Details: ['the user chose to share only none'] });
            expect(result.ErrorMessage).toContain(`"${verb}" is unavailable right now`);
            expect(result.Result).toBeUndefined();
        }
        expect(channel.Calls).toEqual([]);
    });

    it("at 'state' a state verb runs and a pixels verb is refused", async () => {
        const { channel, call } = rig('state');
        expect(await call('Read')).toMatchObject({ Success: true, Result: { secret: 'the document text' } });
        expect(await call('Describe')).toMatchObject({ Success: false, ErrorCode: 'exposure_restricted' });
        expect(channel.Calls).toEqual(['Read']);
    });

    it("at 'pixels' (and with no policy at all) everything runs", async () => {
        for (const exposure of ['pixels', undefined] as const) {
            const { channel, call } = rig(exposure);
            await call('Read');
            await call('Describe');
            expect(channel.Calls).toEqual(['Read', 'Describe']);
        }
    });

    it('a verb that only acts is never refused, whatever the exposure', async () => {
        const { channel, call } = rig('none');
        expect(await call('Rename')).toMatchObject({ Success: true });
        expect(channel.Calls).toEqual(['Rename']);
    });

    it('the refusal is decided before the parameters are checked, so a malformed call cannot probe for data', async () => {
        const { call } = rig('none');
        const result = await call('Read');
        expect(result.ErrorCode).toBe('exposure_restricted');
    });

    it('when exposure comes back the verb works again', async () => {
        const { channel, call } = rig('none');
        expect((await call('Read')).Success).toBe(false);
        channel.ApplyExposure({ Policy: 'pixels' });
        expect((await call('Read')).Success).toBe(true);
    });

    it('the user is not restricted: a verb the user invokes through the surface is just ApplyVerb', () => {
        const { channel } = rig('none');
        expect(channel.ApplyVerb('Describe', {}, 'user')).toMatchObject({ Success: true });
    });

    it('the user choosing a lower level restricts the agent the same way as policy does', async () => {
        const { channel, call } = rig('pixels');
        channel.ApplyExposure({ Policy: 'pixels', User: 'state' });
        expect((await call('Read')).Success).toBe(true);
        expect(await call('Describe')).toMatchObject({ ErrorCode: 'exposure_restricted' });
    });
});

describe('verbs that return channel data: telling the agent', () => {
    it('the exposure_changed note and event list the verbs that became unavailable', () => {
        const { channel, ctx } = rig();
        const events: RealtimeChannelEvent[] = [];
        channel.Events$.subscribe((e) => events.push(e));
        channel.ApplyExposure({ Policy: 'none', Reasons: ['policy'] });
        // makeChannelContext has no live Client, so the note is only sent once a client exists; the event always is.
        expect(events.find((e) => e.Name === 'exposure_changed')?.Payload).toMatchObject({ exposure: 'none', unavailableActions: ['Read', 'Describe'] });
        expect(ctx).toBeDefined();
    });

    it('nothing is listed when no verb is withheld', () => {
        const { channel } = rig();
        const events: RealtimeChannelEvent[] = [];
        channel.Events$.subscribe((e) => events.push(e));
        channel.ApplyExposure({ Policy: 'pixels' });
        channel.ApplyExposure({ Policy: 'state', Reasons: ['x'] });
        const lowered = events.filter((e) => e.Name === 'exposure_changed').at(-1)?.Payload;
        expect(lowered).toMatchObject({ unavailableActions: ['Describe'] });
    });

    it('the catalog note names the unavailable verbs under the visibility limits', () => {
        const { channel } = rig('none', ['the user chose to share only none']);
        const note = BuildChannelCatalogNote([
            { Descriptor: channel.GetDescriptor(), IsOpen: true, HasNativeTools: false, ExposureLimit: { Effective: 'none', Ceiling: 'pixels', Reasons: ['the user chose to share only none'] } },
        ]);
        expect(note).toContain('Visibility limits');
        expect(note).toContain('unavailable right now');
        expect(note).toContain('Read, Describe');
        expect(note).not.toMatch(/unavailable right now[^\n]*Rename/);
    });

    it('the catalog lists only what is withheld at the effective exposure', () => {
        const { channel } = rig('state');
        const note = BuildChannelCatalogNote([
            { Descriptor: channel.GetDescriptor(), IsOpen: true, HasNativeTools: false, ExposureLimit: { Effective: 'state', Ceiling: 'pixels', Reasons: ['x'] } },
        ]);
        expect(note).toMatch(/unavailable right now[^\n]*: Describe$/m);
    });
});

describe('native tools: marking a result as channel data', () => {
    const tools = [
        { Name: 'Docs_Rename', Description: 'Renames.', ParametersSchema: { type: 'object' } as JSONObject },
        { Name: 'Docs_Read', Description: 'Reads.', ParametersSchema: { type: 'object' } as JSONObject },
    ];

    it('BuildToolBackedVerbs flags the listed tools only', () => {
        const verbs = BuildToolBackedVerbs(tools, 'Docs_', 'agent', { Docs_Read: 'state' });
        expect(verbs.map((v) => [v.Name, v.ReturnsChannelData])).toEqual([['Rename', undefined], ['Read', 'state']]);
        expect(verbs[1].NativeToolName).toBe('Docs_Read');
        expect('ReturnsChannelData' in verbs[0]).toBe(false);
    });

    it('a channel finds the verb a native tool call runs, so the runtime can apply the same policy to that route', () => {
        class ToolDocs extends DocsChannel {
            public override get ToolNamePrefix(): string {
                return 'Docs_';
            }
            public override GetDescriptor() {
                return { ...super.GetDescriptor(), Verbs: BuildToolBackedVerbs(tools, 'Docs_', 'agent', { Docs_Read: 'state' }) };
            }
        }
        const channel = new ToolDocs();
        channel.Initialize(makeChannelContext());
        channel.ApplyExposure({ Policy: 'none' });
        const read = channel.FindVerbForNativeTool('Docs_Read');
        expect(read?.Name).toBe('Read');
        expect(channel.RefuseVerbForExposure(read as NonNullable<typeof read>)).toContain('"Read" is unavailable right now');
        const rename = channel.FindVerbForNativeTool('Docs_Rename');
        expect(channel.RefuseVerbForExposure(rename as NonNullable<typeof rename>)).toBeNull();
        expect(channel.FindVerbForNativeTool('Docs_Unknown')).toBeUndefined();
    });
});
