import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Subject, merge, map, type Observable } from 'rxjs';
import type { Type } from '@angular/core';
import type { JSONObject } from '@memberjunction/ai';
import type { RealtimeChannelDescriptor, RealtimeChannelActor } from '@memberjunction/ai-core-plus';
import type { RealtimeChannelContext, RealtimeChannelEvent, RealtimeChannelOutput, RealtimeChannelVerbResult } from '@memberjunction/realtime-runtime';
import { AngularComponentChannel, type ChannelSurfaceEvent } from '../lib/angular-component-channel';
import { ChannelFrameCapture } from '../lib/channel-frame-capture';

/** A stand-in for an existing component: plain members and outputs, no framework needed. */
class CounterComponent {
    public Value = 0;
    public Limit = 10;
    public readonly Changed = new Subject<number>();
    public readonly Finished = new Subject<{ final: number }>();
    public Seeded: JSONObject | null = null;
    public Add(amount: number): boolean {
        if (this.Value + amount > this.Limit) {
            return false;
        }
        this.Value += amount;
        this.Changed.next(this.Value);
        return true;
    }
    public UserClick(): void {
        this.Add(1);
    }
}

const DESCRIPTOR: RealtimeChannelDescriptor = {
    Key: 'Counter',
    Version: '1.0.0',
    DisplayName: 'Counter',
    Instructions: 'A counter you and the user both add to.',
    Nouns: [{ Name: 'counter', Description: 'The count', Schema: { type: 'object', properties: { value: { type: 'number' } } } }],
    Verbs: [
        {
            Name: 'add',
            Description: 'Add to the counter',
            ParametersSchema: { type: 'object', properties: { amount: { type: 'number' } }, required: ['amount'], additionalProperties: false },
            InvokableBy: 'both',
        },
        { Name: 'wipe', Description: 'Clear it', ParametersSchema: { type: 'object' }, InvokableBy: 'user' },
        { Name: 'explode', Description: 'Always throws', ParametersSchema: { type: 'object' }, InvokableBy: 'both' },
        { Name: 'peek', Description: 'Read the count back', ParametersSchema: { type: 'object' }, InvokableBy: 'both', ReturnsChannelData: 'state' },
    ],
    Inputs: { type: 'object', properties: { start: { type: 'number' } } },
    Events: [{ Name: 'changed', Description: 'The count changed' }],
    Output: { type: 'object', properties: { final: { type: 'number' } }, required: ['final'] },
    DisplayPolicy: 'on-demand',
    DefaultAvailability: 'opt-in',
    MaxExposure: 'pixels',
};

class CounterChannel extends AngularComponentChannel<CounterComponent> {
    protected readonly ComponentClass: Type<CounterComponent> = CounterComponent;
    protected readonly Descriptor = DESCRIPTOR;
    public Restored: Array<JSONObject | null> = [];
    public Element: HTMLElement | null = { tag: 'counter-root' } as unknown as HTMLElement;

    protected ReadSurfaceState(c: CounterComponent): JSONObject {
        return { counter: { value: c.Value } };
    }
    protected ApplySurfaceVerb(c: CounterComponent, verb: string, args: JSONObject, actor: RealtimeChannelActor): RealtimeChannelVerbResult | Promise<RealtimeChannelVerbResult> {
        switch (verb) {
            case 'add':
                return c.Add(args['amount'] as number)
                    ? { Success: true, Result: { value: c.Value, by: actor } }
                    : { Success: false, ErrorCode: 'over_limit', Error: `The counter cannot go above ${c.Limit}.` };
            case 'wipe':
                c.Value = 0;
                return { Success: true };
            case 'peek':
                return { Success: true, Result: { value: c.Value } };
            default:
                throw new Error('boom');
        }
    }
    protected SurfaceEvents(c: CounterComponent): Observable<ChannelSurfaceEvent> {
        return merge(c.Changed.pipe(map((value): ChannelSurfaceEvent => ({ Name: 'changed', Payload: { value } }))));
    }
    protected override OnSurfaceOpen(c: CounterComponent, inputs: JSONObject): void {
        c.Seeded = inputs;
        c.Value = typeof inputs['start'] === 'number' ? inputs['start'] : 0;
    }
    protected override SurfaceCompletion(c: CounterComponent): Observable<JSONObject> {
        return c.Finished.pipe(map((f) => ({ final: f.final })));
    }
    protected override OnSurfaceBound(c: CounterComponent, lastState: JSONObject | null): void {
        this.Restored.push(lastState);
        const counter = lastState?.['counter'] as JSONObject | undefined;
        if (counter && typeof counter['value'] === 'number') {
            c.Value = counter['value'];
        }
    }
    protected override SurfaceElement(): HTMLElement | null {
        return this.Element;
    }
    public set BindTimeout(ms: number) {
        this.SurfaceBindTimeoutMs = ms;
    }
}

class FakeVideoClient {
    public Frames: string[] = [];
    public Up = true;
    public IsTrackEstablished(modality: string, direction: string): boolean {
        return this.Up && modality === 'video' && direction === 'inbound';
    }
    public readonly EstablishedTracks = [{ Descriptor: { Modality: 'video', Direction: 'inbound', Rate: 4 } }];
    public readonly MaxInboundVideoStreams = 1;
    public SendVideoFrame(data: string): boolean {
        this.Frames.push(data);
        return true;
    }
    public SendContextNote(): void {}
}

function context(client: FakeVideoClient | null = null): RealtimeChannelContext & { Notes: string[] } {
    const notes: string[] = [];
    return {
        AgentName: 'Sage',
        Provider: null,
        SendContextNote: (text: string) => notes.push(text),
        RequestSave: () => undefined,
        SetFocusMode: () => undefined,
        SaveAsArtifact: async () => null,
        AgentSessionID: null,
        ExecuteServerAction: async () => null,
        ChannelConfig: {},
        Client: client as unknown as RealtimeChannelContext['Client'],
        Notes: notes,
    } as RealtimeChannelContext & { Notes: string[] };
}

function rig(client: FakeVideoClient | null = null) {
    const channel = new CounterChannel();
    const ctx = context(client);
    channel.Initialize(ctx);
    const events: RealtimeChannelEvent[] = [];
    channel.Events$.subscribe((e) => events.push(e));
    const outputs: RealtimeChannelOutput[] = [];
    channel.Output$.subscribe((o) => outputs.push(o));
    return { channel, ctx, events, outputs };
}

describe('AngularComponentChannel: identity comes from the descriptor', () => {
    it('derives the channel name, tab title, descriptor and surface component from what the subclass declares', () => {
        const { channel } = rig();
        expect(channel.ChannelName).toBe('Counter');
        expect(channel.TabTitle).toBe('Counter');
        expect(channel.GetDescriptor()).toBe(DESCRIPTOR);
        expect(channel.GetSurfaceComponent()).toBe(CounterComponent);
        expect(channel.GetToolDefinitions()).toEqual([]);
    });
});

describe('AngularComponentChannel: binding and events', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('records what the component emits as a typed event attributed to the user, and tells the model once', () => {
        const { channel, ctx, events } = rig(new FakeVideoClient());
        const component = new CounterComponent();
        channel.BindSurface(component);
        component.UserClick();
        const changed = events.find((e) => e.Name === 'changed');
        expect(changed).toMatchObject({ Payload: { value: 1 } });
        expect(changed?.ChangeId).toBeDefined();
        vi.advanceTimersByTime(2000);
        expect(ctx.Notes.length).toBeGreaterThan(0);
        expect(ctx.Notes.join('\n')).toContain('Counter');
    });

    it("attributes an event the component emits while the agent's verb runs to the agent", async () => {
        const { channel, events } = rig();
        const component = new CounterComponent();
        channel.BindSurface(component);
        const done = channel.ApplyVerb('add', { amount: 2 }, 'agent');
        await vi.advanceTimersByTimeAsync(0);
        expect(await done).toMatchObject({ Success: true, Result: { value: 2, by: 'agent' } });
        expect(events.filter((e) => e.Name === 'changed')).toHaveLength(1);
    });

    it('an event with Perceive false is emitted to observers but does not tell the model', async () => {
        class QuietChannel extends CounterChannel {
            protected override SurfaceEvents(c: CounterComponent): Observable<ChannelSurfaceEvent> {
                return c.Changed.pipe(map((value): ChannelSurfaceEvent => ({ Name: 'changed', Payload: { value }, Perceive: false })));
            }
        }
        const channel = new QuietChannel();
        const ctx = context(new FakeVideoClient());
        channel.Initialize(ctx);
        const events: RealtimeChannelEvent[] = [];
        channel.Events$.subscribe((e) => events.push(e));
        const component = new CounterComponent();
        channel.BindSurface(component);
        component.UserClick();
        await vi.advanceTimersByTimeAsync(3000);
        expect(events.some((e) => e.Name === 'changed')).toBe(true);
        expect(ctx.Notes).toEqual([]);
    });

    it('stops listening to a component after unbind, and to the old one when a new one binds', () => {
        const { channel, events } = rig();
        const first = new CounterComponent();
        channel.BindSurface(first);
        const second = new CounterComponent();
        channel.BindSurface(second);
        first.UserClick();
        expect(events.filter((e) => e.Name === 'changed')).toHaveLength(0);
        second.UserClick();
        expect(events.filter((e) => e.Name === 'changed')).toHaveLength(1);
        channel.UnbindSurface();
        second.UserClick();
        expect(events.filter((e) => e.Name === 'changed')).toHaveLength(1);
    });

    it('logs a failing event stream instead of letting it escape', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        class BrokenChannel extends CounterChannel {
            protected override SurfaceEvents(): Observable<ChannelSurfaceEvent> {
                const s = new Subject<ChannelSurfaceEvent>();
                queueMicrotask(() => s.error(new Error('stream died')));
                return s;
            }
        }
        const channel = new BrokenChannel();
        channel.Initialize(context());
        channel.BindSurface(new CounterComponent());
        return Promise.resolve().then(() => {
            expect(error.mock.calls.some((c) => String(c[0]).includes('stream died'))).toBe(true);
            error.mockRestore();
        });
    });
});

describe('AngularComponentChannel: verbs', () => {
    it('resolves a verb, validates its parameters, runs it on the component and returns the structured result', async () => {
        const { channel } = rig();
        const component = new CounterComponent();
        channel.BindSurface(component);
        expect(await channel.ApplyVerb('add', { amount: 3 }, 'agent')).toMatchObject({ Success: true, Result: { value: 3 } });
        expect(component.Value).toBe(3);
        expect(await channel.ApplyVerb('ADD', { amount: 1 }, 'user')).toMatchObject({ Success: true });
    });

    it('gives the model a message it can recover from when the component refuses', async () => {
        const { channel } = rig();
        channel.BindSurface(new CounterComponent());
        expect(await channel.ApplyVerb('add', { amount: 99 }, 'agent')).toMatchObject({ Success: false, ErrorCode: 'over_limit', Error: 'The counter cannot go above 10.' });
    });

    it('refuses an unknown verb, listing the ones it has', async () => {
        const { channel } = rig();
        channel.BindSurface(new CounterComponent());
        const result = await channel.ApplyVerb('nope', {}, 'agent');
        expect(result).toMatchObject({ Success: false, ErrorCode: 'unknown_verb' });
        expect(result.Details?.[0]).toContain('add');
    });

    it('refuses invalid parameters before the component sees them', async () => {
        const { channel } = rig();
        const component = new CounterComponent();
        const spy = vi.spyOn(component, 'Add');
        channel.BindSurface(component);
        expect(await channel.ApplyVerb('add', { amount: 'lots' } as unknown as JSONObject, 'agent')).toMatchObject({ Success: false, ErrorCode: 'invalid_params' });
        expect(await channel.ApplyVerb('add', {}, 'agent')).toMatchObject({ Success: false, ErrorCode: 'invalid_params' });
        expect(spy).not.toHaveBeenCalled();
    });

    it('turns a verb that throws into a failure the model can read, and logs it', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { channel } = rig();
        channel.BindSurface(new CounterComponent());
        expect(await channel.ApplyVerb('explode', {}, 'agent')).toMatchObject({ Success: false, ErrorCode: 'verb_failed' });
        expect(error.mock.calls.some((c) => String(c[0]).includes('boom'))).toBe(true);
        error.mockRestore();
    });

    it('withholds a verb whose result needs more exposure than the channel has, for the agent only', async () => {
        const { channel } = rig();
        const component = new CounterComponent();
        channel.BindSurface(component);
        channel.ApplyExposure({ Policy: 'none' });
        expect(await channel.ApplyVerb('peek', {}, 'agent')).toMatchObject({ Success: false, ErrorCode: 'exposure_restricted' });
        expect(await channel.ApplyVerb('peek', {}, 'user')).toMatchObject({ Success: true });
        channel.ApplyExposure({ Policy: 'state' });
        expect(await channel.ApplyVerb('peek', {}, 'agent')).toMatchObject({ Success: true, Result: { value: 0 } });
    });

    it('serializes verbs: a second call runs only after the first has finished', async () => {
        const order: string[] = [];
        class SlowChannel extends CounterChannel {
            protected override async ApplySurfaceVerb(c: CounterComponent, verb: string, args: JSONObject, actor: RealtimeChannelActor): Promise<RealtimeChannelVerbResult> {
                order.push(`start:${String(args['amount'])}`);
                await new Promise((r) => setTimeout(r, args['amount'] === 1 ? 20 : 0));
                order.push(`end:${String(args['amount'])}`);
                return super.ApplySurfaceVerb(c, verb, args, actor);
            }
        }
        const channel = new SlowChannel();
        channel.Initialize(context());
        channel.BindSurface(new CounterComponent());
        await Promise.all([channel.ApplyVerb('add', { amount: 1 }, 'agent'), channel.ApplyVerb('add', { amount: 2 }, 'agent')]);
        expect(order).toEqual(['start:1', 'end:1', 'start:2', 'end:2']);
    });
});

describe('AngularComponentChannel: a verb that arrives before the surface exists', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('waits for the surface and then runs against the real component, in order', async () => {
        const { channel } = rig();
        const first = channel.ApplyVerb('add', { amount: 1 }, 'agent');
        const second = channel.ApplyVerb('add', { amount: 2 }, 'agent');
        await vi.advanceTimersByTimeAsync(1000);
        const component = new CounterComponent();
        channel.BindSurface(component);
        expect(await first).toMatchObject({ Success: true, Result: { value: 1 } });
        expect(await second).toMatchObject({ Success: true, Result: { value: 3 } });
    });

    it('fails with surface_unavailable and a message the agent can act on when the surface never binds', async () => {
        const { channel } = rig();
        const pending = channel.ApplyVerb('add', { amount: 1 }, 'agent');
        await vi.advanceTimersByTimeAsync(5001);
        const result = await pending;
        expect(result).toMatchObject({ Success: false, ErrorCode: 'surface_unavailable' });
        expect(result.Error).toContain('Ask the user to open it');
    });

    it('lets the bind timeout be tuned by a subclass', async () => {
        const channel = new CounterChannel();
        channel.BindTimeout = 50;
        channel.Initialize(context());
        const pending = channel.ApplyVerb('add', { amount: 1 }, 'agent');
        await vi.advanceTimersByTimeAsync(60);
        expect(await pending).toMatchObject({ ErrorCode: 'surface_unavailable' });
    });

    it('releases waiters when the channel is disposed', async () => {
        const { channel } = rig();
        const pending = channel.ApplyVerb('add', { amount: 1 }, 'agent');
        await vi.advanceTimersByTimeAsync(10);
        channel.Dispose();
        expect(await pending).toMatchObject({ ErrorCode: 'surface_unavailable' });
    });
});

describe('AngularComponentChannel: open, completion and persistence', () => {
    it('applies the open inputs at once when the surface is bound', async () => {
        const { channel } = rig();
        const component = new CounterComponent();
        channel.BindSurface(component);
        expect(await channel.Open({ start: 4 })).toMatchObject({ Success: true });
        expect(component.Value).toBe(4);
        expect(component.Seeded).toEqual({ start: 4 });
    });

    it('applies the open inputs when the surface binds, if it was not there yet', async () => {
        const { channel } = rig();
        expect(await channel.Open({ start: 7 })).toMatchObject({ Success: true });
        const component = new CounterComponent();
        channel.BindSurface(component);
        await Promise.resolve();
        expect(component.Value).toBe(7);
        // seeding happens once: a rebind does not re-seed
        const again = new CounterComponent();
        channel.BindSurface(again);
        await Promise.resolve();
        expect(again.Seeded).toBeNull();
    });

    it('logs, rather than throws, when seeding the late surface fails', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        class RefusingChannel extends CounterChannel {
            protected override OnSurfaceOpen(): RealtimeChannelVerbResult {
                return { Success: false, Error: 'bad seed' };
            }
        }
        const channel = new RefusingChannel();
        channel.Initialize(context());
        await channel.Open({});
        channel.BindSurface(new CounterComponent());
        await Promise.resolve();
        expect(error.mock.calls.some((c) => String(c[0]).includes('bad seed'))).toBe(true);
        error.mockRestore();
    });

    it("turns the component's completion into Complete(output), validated by the base class", () => {
        const { channel, outputs } = rig();
        const component = new CounterComponent();
        channel.BindSurface(component);
        component.Finished.next({ final: 9 });
        expect(outputs).toHaveLength(1);
        expect(outputs[0].Output).toEqual({ final: 9 });
    });

    it('keeps the last state across unbind and hands it to the next component (collapse then expand)', () => {
        const { channel } = rig();
        const first = new CounterComponent();
        channel.BindSurface(first);
        first.Value = 6;
        channel.UnbindSurface();
        expect(channel.GetState()).toEqual({ counter: { value: 6 } });
        const second = new CounterComponent();
        channel.BindSurface(second);
        expect(second.Value).toBe(6);
        expect(channel.Restored).toEqual([null, { counter: { value: 6 } }]);
    });

    it('serializes the state of record and restores it into a component created after a resume', () => {
        const { channel } = rig();
        const live = new CounterComponent();
        channel.BindSurface(live);
        live.Value = 5;
        const saved = channel.SerializeState();
        expect(JSON.parse(saved ?? 'null')).toEqual({ counter: { value: 5 } });

        const resumed = rig().channel;
        expect(resumed.RestoreState(saved ?? '')).toBe(true);
        const fresh = new CounterComponent();
        resumed.BindSurface(fresh);
        expect(fresh.Value).toBe(5);
    });

    it('has nothing to serialize before there is any state, and rejects state that is not a JSON object', () => {
        const { channel } = rig();
        expect(channel.SerializeState()).toBeNull();
        expect(channel.RestoreState('not json')).toBe(false);
        expect(channel.RestoreState('[1,2]')).toBe(false);
        expect(channel.RestoreState('5')).toBe(false);
    });

    it('a state reader that throws never breaks a call: it is logged and the last state is used', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        class FragileChannel extends CounterChannel {
            public Break = false;
            protected override ReadSurfaceState(c: CounterComponent): JSONObject {
                if (this.Break) {
                    throw new Error('reader broke');
                }
                return super.ReadSurfaceState(c);
            }
        }
        const channel = new FragileChannel();
        channel.Initialize(context());
        channel.BindSurface(new CounterComponent());
        expect(channel.GetState()).toEqual({ counter: { value: 0 } });
        channel.Break = true;
        expect(channel.GetState()).toEqual({ counter: { value: 0 } });
        expect(error.mock.calls.some((c) => String(c[0]).includes('reader broke'))).toBe(true);
        error.mockRestore();
    });
});

describe('AngularComponentChannel: showing the model a picture', () => {
    afterEach(() => {
        ChannelFrameCapture.Instance.Register(null);
        vi.restoreAllMocks();
    });

    it('offers no video track unless the host registered a rasterizer', () => {
        const { channel } = rig(new FakeVideoClient());
        expect(channel.GetSourcedTracks()).toEqual([]);
    });

    it('offers no video track when the subclass cannot name the component element', () => {
        ChannelFrameCapture.Instance.Register(async () => 'jpeg');
        class NoElementChannel extends AngularComponentChannel<CounterComponent> {
            protected readonly ComponentClass: Type<CounterComponent> = CounterComponent;
            protected readonly Descriptor = DESCRIPTOR;
            protected ReadSurfaceState(): JSONObject {
                return {};
            }
            protected ApplySurfaceVerb(): RealtimeChannelVerbResult {
                return { Success: true };
            }
            protected SurfaceEvents(): Observable<ChannelSurfaceEvent> {
                return new Subject<ChannelSurfaceEvent>();
            }
        }
        const channel = new NoElementChannel();
        channel.Initialize(context(new FakeVideoClient()));
        expect(channel.GetSourcedTracks()).toEqual([]);
    });

    it('sources a video track when a rasterizer is registered and the subclass names the element', () => {
        ChannelFrameCapture.Instance.Register(async () => 'jpeg');
        const { channel } = rig(new FakeVideoClient());
        expect(channel.GetSourcedTracks()).toHaveLength(1);
    });

    it('end to end: a user move reaches the model as a frame tagged with the change id, and only at pixels', async () => {
        const capturer = vi.fn(async () => 'FRAME');
        ChannelFrameCapture.Instance.Register(capturer);
        const client = new FakeVideoClient();
        const { channel, events } = rig(client);
        const component = new CounterComponent();
        channel.BindSurface(component);
        channel.ApplyExposure({ Policy: 'pixels' });
        component.UserClick();
        await vi.waitFor(() => expect(client.Frames.length).toBeGreaterThan(0));
        expect(client.Frames[0]).toBe('FRAME');
        expect(capturer).toHaveBeenCalledWith(channel.Element);
        const pushed = events.find((e) => e.Name === 'frame_pushed');
        expect(pushed?.ChangeId).toBe(events.find((e) => e.Name === 'changed')?.ChangeId);

        const before = capturer.mock.calls.length;
        channel.ApplyExposure({ Policy: 'state' });
        component.UserClick();
        await new Promise((r) => setTimeout(r, 30));
        expect(capturer.mock.calls.length).toBe(before);
    });

    it('sends nothing without a video track, without a surface, or without an element, and logs a rasterizer that throws', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        let fail = false;
        const capturer = vi.fn(async () => {
            if (fail) {
                throw new Error('tainted canvas');
            }
            return 'FRAME';
        });
        ChannelFrameCapture.Instance.Register(capturer);
        const client = new FakeVideoClient();
        const { channel } = rig(client);
        channel.ApplyExposure({ Policy: 'pixels' });
        const capture = (): Promise<string | null> => (channel as unknown as { captureFrame(): Promise<string | null> }).captureFrame();

        expect(await capture()).toBeNull(); // no surface
        channel.BindSurface(new CounterComponent());
        client.Up = false;
        expect(await capture()).toBeNull(); // no inbound video track
        client.Up = true;
        channel.Element = null;
        expect(await capture()).toBeNull(); // nothing on screen
        channel.Element = { tag: 'root' } as unknown as HTMLElement;
        fail = true;
        expect(await capture()).toBeNull();
        expect(error.mock.calls.some((c) => String(c[0]).includes('tainted canvas'))).toBe(true);
        fail = false;
        expect(await capture()).toBe('FRAME');
    });
});

describe('AngularComponentChannel: a verb that never answers', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    /** A channel whose `add` verb hangs until the test settles it. */
    class HangingChannel extends CounterChannel {
        public Pending: Array<{ resolve: (r: RealtimeChannelVerbResult) => void; reject: (e: Error) => void }> = [];
        public Hang = true;
        protected override ApplySurfaceVerb(c: CounterComponent, verb: string, args: JSONObject, actor: RealtimeChannelActor): RealtimeChannelVerbResult | Promise<RealtimeChannelVerbResult> {
            if (this.Hang && verb === 'add') {
                return new Promise<RealtimeChannelVerbResult>((resolve, reject) => this.Pending.push({ resolve, reject }));
            }
            return super.ApplySurfaceVerb(c, verb, args, actor);
        }
        public set Timeout(ms: number) {
            this.VerbTimeoutMs = ms;
        }
    }

    function hangingRig() {
        const channel = new HangingChannel();
        const ctx = context(new FakeVideoClient());
        channel.Initialize(ctx);
        const component = new CounterComponent();
        channel.BindSurface(component);
        return { channel, ctx, component };
    }

    it('fails the call after the timeout with a message the agent can act on, and logs once with the channel and verb', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { channel } = hangingRig();
        const pending = channel.ApplyVerb('add', { amount: 1 }, 'agent');
        await vi.advanceTimersByTimeAsync(14999);
        let settled = false;
        void pending.then(() => (settled = true));
        await Promise.resolve();
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(2);
        const result = await pending;
        expect(result).toMatchObject({ Success: false, ErrorCode: 'verb_timeout' });
        expect(result.Error).toBe('The Counter didn\'t respond to "add" within 15s; try again or ask the user.');
        const logs = error.mock.calls.filter((c) => String(c[0]).includes('"add" did not respond'));
        expect(logs).toHaveLength(1);
        expect(String(logs[0][0])).toContain('[RealtimeChannel:Counter]');
    });

    it('releases the queue: the next verb still runs after a hung one times out', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { channel, component } = hangingRig();
        const hung = channel.ApplyVerb('add', { amount: 1 }, 'agent');
        const next = channel.ApplyVerb('wipe', {}, 'user');
        component.Value = 4;
        await vi.advanceTimersByTimeAsync(15001);
        expect(await hung).toMatchObject({ ErrorCode: 'verb_timeout' });
        expect(await next).toMatchObject({ Success: true });
        expect(component.Value).toBe(0);
    });

    it('ignores a late success: the caller already has its answer, and the channel records the real change for perception', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { channel, ctx, component } = hangingRig();
        const hung = channel.ApplyVerb('add', { amount: 1 }, 'agent');
        await vi.advanceTimersByTimeAsync(15001);
        expect(await hung).toMatchObject({ ErrorCode: 'verb_timeout' });
        const events: string[] = [];
        channel.Events$.subscribe((e) => events.push(e.Name));

        component.Value = 1; // what the late verb did to the component
        channel.Pending[0].resolve({ Success: true, Result: { value: 1 } });
        await vi.advanceTimersByTimeAsync(2000);
        expect(ctx.Notes.length).toBeGreaterThan(0); // the model's picture reconverges on the real state
        expect(ctx.Notes.join('\n')).toContain('"value":1');
        expect(events.filter((n) => n === 'completed')).toEqual([]); // no result was delivered a second time
    });

    it('a late success after the component is gone, or a late failure, records nothing and is logged', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { channel, ctx } = hangingRig();
        const first = channel.ApplyVerb('add', { amount: 1 }, 'agent');
        const second = channel.ApplyVerb('add', { amount: 2 }, 'agent');
        await vi.advanceTimersByTimeAsync(15001);
        await first;
        await vi.advanceTimersByTimeAsync(15001);
        await second;
        const notesBefore = ctx.Notes.length;

        channel.UnbindSurface();
        channel.Pending[0].resolve({ Success: true });
        channel.Pending[1].reject(new Error('late boom'));
        await vi.advanceTimersByTimeAsync(3000);
        expect(ctx.Notes.length).toBe(notesBefore);
        expect(error.mock.calls.some((c) => String(c[0]).includes('failed after it had timed out: late boom'))).toBe(true);
    });

    it('does not time out a verb that answers in time, and clears its timer', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { channel } = hangingRig();
        const call = channel.ApplyVerb('add', { amount: 1 }, 'agent');
        await vi.advanceTimersByTimeAsync(5000);
        channel.Pending[0].resolve({ Success: true, Result: { value: 1 } });
        expect(await call).toMatchObject({ Success: true });
        await vi.advanceTimersByTimeAsync(60000);
        expect(vi.getTimerCount()).toBe(0);
        expect(error.mock.calls.some((c) => String(c[0]).includes('did not respond'))).toBe(false);
    });

    it('the limit is overridable, and a non-positive value turns it off', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const short = hangingRig();
        short.channel.Timeout = 100;
        const p = short.channel.ApplyVerb('add', { amount: 1 }, 'agent');
        await vi.advanceTimersByTimeAsync(101);
        expect(await p).toMatchObject({ ErrorCode: 'verb_timeout', Error: expect.stringContaining('within 1s') });

        const off = hangingRig();
        off.channel.Timeout = 0;
        let settled = false;
        void off.channel.ApplyVerb('add', { amount: 1 }, 'agent').then(() => (settled = true));
        await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
        expect(settled).toBe(false);
    });

    it('a verb that throws synchronously is still reported as verb_failed, not a timeout', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { channel } = hangingRig();
        channel.Hang = false;
        expect(await channel.ApplyVerb('explode', {}, 'agent')).toMatchObject({ ErrorCode: 'verb_failed' });
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe('AngularComponentChannel: teardown', () => {
    it('Dispose lets go of the component and completes the event stream', () => {
        const { channel, events } = rig();
        const component = new CounterComponent();
        channel.BindSurface(component);
        let completed = false;
        channel.Events$.subscribe({ complete: () => (completed = true) });
        channel.Dispose();
        component.UserClick();
        expect(events.filter((e) => e.Name === 'changed')).toHaveLength(0);
        expect(completed).toBe(true);
    });
});
