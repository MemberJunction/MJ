// The channel imports its standalone Angular surface (partial-compiled Angular libs need the JIT compiler
// in this node environment), so load the compiler FIRST.
import '@angular/compiler';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import type { JSONObject } from '@memberjunction/ai';
import { BaseRealtimeChannelClient, type RealtimeChannelEvent } from '@memberjunction/realtime-runtime';
import {
    InteractiveComponentChannel,
    LoadRealtimeInteractiveComponentChannel,
} from '../lib/components/realtime/interactive-component/interactive-component-channel';
import { ChannelFrameCapture } from '@memberjunction/ng-realtime-channels';
import { ComponentArtifactError } from '../lib/components/realtime/interactive-component/interactive-component-types';
import {
    FakeArtifactSource,
    FakeHandle,
    FakeVideoClient,
    MakeArtifact,
    MakeContext,
    MakeSpec,
    type ChannelLog,
} from './helpers/interactive-component-fixtures';

LoadRealtimeInteractiveComponentChannel();

/** The channel with its timers shortened and its protected perception flush exposed. */
class TestChannel extends InteractiveComponentChannel {
    public constructor() {
        super();
        this.HandlePollIntervalMs = 1;
        this.DataSettleMs = 5;
    }
    public Flush(): void {
        this.FlushPerception();
    }
    public Capture(): Promise<string | null> {
        return this.CaptureActiveFrame();
    }
}

const REVENUE_SPEC = MakeSpec({
    name: 'Revenue',
    title: 'Revenue dashboard',
    properties: [{ name: 'year', description: 'Fiscal year.', type: 'number', required: true }],
    events: [{ name: 'rowSelected', description: 'A row was selected.', parameters: [{ name: 'rowId', description: 'Row.', type: 'string' }] }],
    methods: {
        standardMethodsSupported: { refresh: true, getCurrentDataState: true, isDirty: true, validate: true, reset: true, print: true, scrollTo: true, focus: true },
        customMethods: [
            { name: 'setRegion', description: 'Filters by region.', parameters: [{ name: 'region', type: 'string' }, { name: 'topN?', type: 'number' }], returnType: 'string' },
        ],
    },
});
const PIPELINE_SPEC = MakeSpec({
    name: 'Pipeline',
    title: 'Pipeline board',
    methods: {
        standardMethodsSupported: { refresh: true },
        customMethods: [{ name: 'setRegion', description: 'Filters deals by region.', parameters: [{ name: 'territory', type: 'string' }], returnType: 'void' }],
    },
});

const A1 = '11111111-1111-1111-1111-111111111111';
const A2 = '22222222-2222-2222-2222-222222222222';
const V1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const V2 = 'aaaaaaaa-0000-0000-0000-000000000002';
const V3 = 'aaaaaaaa-0000-0000-0000-000000000003';
const P1 = 'bbbbbbbb-0000-0000-0000-000000000001';

interface Rig {
    Channel: TestChannel;
    Source: FakeArtifactSource;
    Log: ChannelLog;
    Events: RealtimeChannelEvent[];
}

function makeRig(config: JSONObject = {}): Rig {
    const Source = new FakeArtifactSource()
        .Add(MakeArtifact(A1, V1, 1, REVENUE_SPEC))
        .Add(MakeArtifact(A1, V2, 2, REVENUE_SPEC))
        .Add(MakeArtifact(A2, P1, 1, PIPELINE_SPEC));
    const Log: ChannelLog = { Notes: [] };
    const Channel = new TestChannel();
    Channel.SetArtifactSource(Source);
    Channel.Initialize(MakeContext(Log, config));
    const Events: RealtimeChannelEvent[] = [];
    Channel.Events$.subscribe((e) => Events.push(e));
    return { Channel, Source, Log, Events };
}

/** Opens by version id and returns the result's instance id. */
async function open(channel: TestChannel, versionId: string, extra: JSONObject = {}): Promise<string> {
    const result = await channel.Open({ artifactVersionId: versionId, ...extra });
    expect(result.Success).toBe(true);
    return (result.Result as JSONObject)['instance'] as string;
}

/** Marks an instance's component as rendered and ready, as the surface does once it initializes. */
function mount(channel: TestChannel, instanceId: string): FakeHandle {
    const handle = new FakeHandle();
    channel.Engine.AttachHandle(instanceId, handle);
    return handle;
}

describe('InteractiveComponentChannel: identity and descriptor', () => {
    beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => undefined));
    afterEach(() => vi.restoreAllMocks());

    it('is resolvable from the ClassFactory by its registry ClientPluginClass key', () => {
        const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeChannelClient>(BaseRealtimeChannelClient, 'RealtimeInteractiveComponentChannel');
        expect(instance).toBeInstanceOf(InteractiveComponentChannel);
    });

    it('declares a multi-instance, opt-in, on-demand channel that can reach pixels, with no native tools', () => {
        const { Channel } = makeRig();
        const descriptor = Channel.GetDescriptor();
        expect(descriptor).toMatchObject({
            Key: 'InteractiveComponent',
            MultiInstance: true,
            DefaultAvailability: 'opt-in',
            DisplayPolicy: 'on-demand',
            MaxExposure: 'pixels',
        });
        expect(Channel.GetToolDefinitions()).toEqual([]);
        expect(descriptor.Nouns.map((n) => n.Name)).toEqual(['components']);
    });

    it('with nothing open the verbs are the built-ins and the events are the built-in ones', () => {
        const { Channel } = makeRig();
        const descriptor = Channel.GetDescriptor();
        expect(descriptor.Verbs.map((v) => v.Name)).toEqual(['show_version', 'close']);
        expect(descriptor.Events?.map((e) => e.Name)).toEqual(['opened', 'closed', 'version_changed', 'newer_version_available']);
        expect(descriptor.Inputs).toMatchObject({ properties: { artifactId: {}, artifactVersionId: {}, inputs: {} }, additionalProperties: false });
    });

    it('every open component adds ITS verbs and events to the descriptor', async () => {
        const { Channel } = makeRig();
        await open(Channel, V1, { inputs: { year: 2026 } });
        const descriptor = Channel.GetDescriptor();
        expect(descriptor.Verbs.map((v) => v.Name)).toEqual([
            'show_version', 'close', 'refresh', 'get_data_state', 'validate', 'is_dirty', 'reset', 'print', 'scroll_to', 'focus', 'setRegion',
        ]);
        expect(descriptor.Events?.map((e) => e.Name)).toContain('rowSelected');
    });

    it('a verb two open components share is declared once, with both signatures', async () => {
        const { Channel } = makeRig();
        await open(Channel, V1, { inputs: { year: 2026 } });
        await open(Channel, P1);
        const verbs = Channel.GetDescriptor().Verbs;
        expect(verbs.filter((v) => v.Name === 'setRegion')).toHaveLength(1);
        const merged = verbs.find((v) => v.Name === 'setRegion');
        expect(Object.keys(merged?.ParametersSchema['properties'] as object)).toEqual(['region', 'topN', 'territory']);
        expect(merged?.Description).toContain('Revenue dashboard: region, topN');
        expect(merged?.Description).toContain('Pipeline board: territory');
        expect(verbs.filter((v) => v.Name === 'refresh')).toHaveLength(1);
    });
});

describe('InteractiveComponentChannel: open', () => {
    beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => undefined));
    afterEach(() => vi.restoreAllMocks());

    it('opens a version, names the instance, and tells the agent how to operate it', async () => {
        const { Channel, Events, Log } = makeRig();
        const result = await Channel.Open({ artifactVersionId: V2, inputs: { year: 2026 } });
        expect(result.Success).toBe(true);
        const body = result.Result as JSONObject;
        expect(body).toMatchObject({ opened: true, channel: 'InteractiveComponent', instance: 'c1', artifactId: A1, artifactVersionId: V2, versionNumber: 2, name: 'Revenue dashboard' });
        expect((body['actions'] as string[]).some((a) => a.startsWith('setRegion(region:string, topN?:number)'))).toBe(true);
        expect(body['events']).toEqual(['rowSelected']);
        // The event and the note both name the NEW instance, not the channel's primary one.
        expect(Events.find((e) => e.Name === 'opened')?.Instance).toBe('c1');
        expect(Log.Notes[0]).toMatch(/^\[channel:InteractiveComponent#c1\] opened /);
        expect(Log.Notes[0]).toContain('"c1":{"name":"Revenue dashboard"');
    });

    it('opens the latest version when given an artifact id', async () => {
        const { Channel, Source } = makeRig();
        const result = await Channel.Open({ artifactId: A1, inputs: { year: 2026 } });
        expect((result.Result as JSONObject)['artifactVersionId']).toBe(V2);
        expect(Source.Calls).toEqual([`latest:${A1}`]);
    });

    it('each open is a NEW instance with its own id', async () => {
        const { Channel, Events } = makeRig();
        expect(await open(Channel, V1, { inputs: { year: 1 } })).toBe('c1');
        expect(await open(Channel, P1)).toBe('c2');
        expect(Events.filter((e) => e.Name === 'opened').map((e) => e.Instance)).toEqual(['c1', 'c2']);
        expect(Channel.Engine.ActiveID).toBe('c2');
    });

    it('requires exactly one of artifactId and artifactVersionId', async () => {
        const { Channel } = makeRig();
        for (const inputs of [{}, { artifactId: A1, artifactVersionId: V1 }] as JSONObject[]) {
            const result = await Channel.Open(inputs);
            expect(result).toMatchObject({ Success: false, ErrorCode: 'invalid_params' });
            expect(result.Error).toContain('exactly one');
        }
        expect(Channel.Engine.Instances).toHaveLength(0);
    });

    it('rejects inputs that are not valid for the channel (an unexpected key)', async () => {
        const { Channel } = makeRig();
        const result = await Channel.Open({ artifactVersionId: V1, bogus: true });
        expect(result).toMatchObject({ Success: false, ErrorCode: 'invalid_params' });
    });

    it("validates the component's own inputs against its spec's properties before opening", async () => {
        const { Channel } = makeRig();
        const result = await Channel.Open({ artifactVersionId: V1 });
        expect(result).toMatchObject({ Success: false, ErrorCode: 'invalid_params' });
        expect(result.Details?.join(' ')).toContain('year');
        const wrongType = await Channel.Open({ artifactVersionId: V1, inputs: { year: 'twenty' } });
        expect(wrongType.ErrorCode).toBe('invalid_params');
        expect(Channel.Engine.Instances).toHaveLength(0);
    });

    it('maps each way an artifact can fail to load to a result the agent can act on', async () => {
        const { Channel, Source } = makeRig();
        const cases: Array<[ComponentArtifactError, string]> = [
            [new ComponentArtifactError('not_found', 'No artifact version with that id exists, or you cannot see it.'), 'open_failed'],
            [new ComponentArtifactError('access_denied', 'You do not have access to that artifact.'), 'open_failed'],
            [new ComponentArtifactError('not_a_component', 'It is a Report, not an interactive component.'), 'open_failed'],
            [new ComponentArtifactError('invalid_id', 'not a valid id'), 'invalid_params'],
        ];
        for (const [error, code] of cases) {
            vi.spyOn(Source, 'LoadVersion').mockRejectedValueOnce(error);
            const result = await Channel.Open({ artifactVersionId: V1 });
            expect(result).toMatchObject({ Success: false, ErrorCode: code, Error: error.message, Details: [error.Code] });
        }
    });

    it('an unexpected load failure is logged and reported without leaking the cause', async () => {
        const { Channel, Source } = makeRig();
        vi.spyOn(Source, 'LoadVersion').mockRejectedValueOnce(new Error('connection reset: db-7.internal'));
        const result = await Channel.Open({ artifactVersionId: V1 });
        expect(result).toMatchObject({ Success: false, ErrorCode: 'open_failed', Error: 'That artifact could not be loaded.' });
    });

    it('without an artifact source (no signed-in user) it cannot open anything', async () => {
        const channel = new TestChannel();
        channel.Initialize(MakeContext({ Notes: [] }));
        const result = await channel.Open({ artifactVersionId: V1 });
        expect(result).toMatchObject({ Success: false, ErrorCode: 'open_failed' });
    });

    it('refuses to open past the configured instance cap and says what is open', async () => {
        const { Channel } = makeRig({ maxInstances: 1 });
        await open(Channel, V1, { inputs: { year: 1 } });
        const result = await Channel.Open({ artifactVersionId: P1 });
        expect(result).toMatchObject({ Success: false, ErrorCode: 'open_failed' });
        expect(result.Error).toContain('At most 1 component is open');
        expect(result.Details?.[0]).toContain('c1 (Revenue dashboard)');
    });

    it('opening an artifact that is already open focuses it instead of opening a second copy, and moves it to the requested version', async () => {
        const { Channel, Events } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        await open(Channel, P1);
        const result = await Channel.Open({ artifactVersionId: V2, inputs: { year: 1 } });
        expect(result.Result).toMatchObject({ instance: 'c1', alreadyOpen: true, artifactVersionId: V2 });
        expect(Channel.Engine.Instances).toHaveLength(2);
        expect(Channel.Engine.ActiveID).toBe('c1');
        expect(Events.find((e) => e.Name === 'version_changed')).toMatchObject({ Instance: 'c1', Payload: { from: V1, to: V2, reason: 'agent' } });
    });

    it('reads its configuration from the cascade, and warns about a bad value', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const { Channel } = makeRig({ maxInstances: 'many', autoOpenDelegatedComponents: true });
        expect(Channel.Config.MaxInstances).toBe(4);
        expect(Channel.Config.AutoOpenDelegatedComponents).toBe(true);
        expect(warn.mock.calls.some((c) => String(c[0]).includes('maxInstances'))).toBe(true);
    });
});

describe('InteractiveComponentChannel: show_version and close', () => {
    beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => undefined));
    afterEach(() => vi.restoreAllMocks());

    it('show_version swaps the instance IN PLACE: same id, same inputs, an event, and the new version', async () => {
        const { Channel, Events } = makeRig();
        await open(Channel, V1, { inputs: { year: 2026 } });
        const record = Channel.Engine.Get('c1');
        const result = await Channel.ApplyVerb('show_version', { versionId: V2 }, 'agent');
        expect(result).toMatchObject({ Success: true, Result: { changed: true, instance: 'c1', artifactVersionId: V2, versionNumber: 2 } });
        expect(Channel.Engine.Get('c1')).toBe(record);
        expect(Channel.Engine.Instances).toHaveLength(1);
        expect(record?.Inputs).toEqual({ year: 2026 });
        expect(Events.filter((e) => e.Name === 'version_changed')).toHaveLength(1);
        expect(Events.find((e) => e.Name === 'version_changed')).toMatchObject({ Instance: 'c1', Payload: { from: V1, to: V2, reason: 'agent' } });
    });

    it("the agent's own swap is not announced with a separate note (it asked; state describes the new version)", async () => {
        const { Channel, Log } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        Log.Notes.length = 0;
        await Channel.ApplyVerb('show_version', { versionId: V2 }, 'agent');
        Channel.Flush();
        expect(Log.Notes.some((n) => n.includes(' version_changed '))).toBe(false);
        expect(Log.Notes.some((n) => n.includes(' state_changed ') && n.includes('"versionNumber":2'))).toBe(true);
    });

    it('showing the version already open changes nothing', async () => {
        const { Channel, Events } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        const result = await Channel.ApplyVerb('show_version', { versionId: V1 }, 'agent');
        expect(result.Result).toMatchObject({ changed: false, instance: 'c1' });
        expect(Events.some((e) => e.Name === 'version_changed')).toBe(false);
    });

    it("refuses a version of a DIFFERENT artifact and points at open", async () => {
        const { Channel } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        const result = await Channel.ApplyVerb('show_version', { versionId: P1 }, 'agent');
        expect(result).toMatchObject({ Success: false, ErrorCode: 'verb_failed' });
        expect(result.Error).toContain('different artifact');
        expect(Channel.Engine.Get('c1')?.Artifact.VersionID).toBe(V1);
    });

    it('show_version for a version that cannot be loaded fails cleanly', async () => {
        const { Channel } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        const result = await Channel.ApplyVerb('show_version', { versionId: V3 }, 'agent');
        expect(result).toMatchObject({ Success: false, ErrorCode: 'open_failed' });
    });

    it('close removes the instance, emits closed, and activates the previous one', async () => {
        const { Channel, Events } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        await open(Channel, P1);
        const result = await Channel.ApplyVerb('close', {}, 'agent', 'c2');
        expect(result).toMatchObject({ Success: true, Result: { closed: true, instance: 'c2' } });
        expect(Channel.Engine.Instances.map((r) => r.InstanceID)).toEqual(['c1']);
        expect(Channel.Engine.ActiveID).toBe('c1');
        expect(Events.find((e) => e.Name === 'closed')).toMatchObject({ Instance: 'c2' });
    });

    it('addressing an instance that is not open is refused with the ones that are', async () => {
        const { Channel } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        const result = await Channel.ApplyVerb('close', {}, 'agent', 'c9');
        expect(result).toMatchObject({ Success: false, ErrorCode: 'unknown_instance' });
        expect(result.Details?.[0]).toContain('c1 (Revenue dashboard)');
    });

    it('with nothing open there is nothing to close', async () => {
        const { Channel } = makeRig();
        const result = await Channel.ApplyVerb('close', {}, 'agent');
        expect(result).toMatchObject({ Success: false, ErrorCode: 'verb_failed' });
    });
});

describe('InteractiveComponentChannel: operating a component through its derived verbs', () => {
    let rig: Rig;
    let handle: FakeHandle;

    beforeEach(async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        rig = makeRig();
        await open(rig.Channel, V1, { inputs: { year: 2026 } });
        handle = mount(rig.Channel, 'c1');
        handle.Methods.add('setRegion');
    });
    afterEach(() => vi.restoreAllMocks());

    it('a custom method is called on the component with positional arguments in declaration order, and its result comes back', async () => {
        handle.MethodResult = { rows: 12 };
        const result = await rig.Channel.ApplyVerb('setRegion', { topN: 5, region: 'EMEA' }, 'agent');
        expect(handle.Calls).toEqual(['invoke:setRegion(["EMEA",5])']);
        expect(result).toMatchObject({ Success: true, Result: { instance: 'c1', result: { rows: 12 } } });
    });

    it('awaits an async method', async () => {
        handle.InvokeMethod = async (name: string) => {
            await new Promise((resolve) => setTimeout(resolve, 3));
            return `done ${name}`;
        };
        const result = await rig.Channel.ApplyVerb('setRegion', { region: 'APAC' }, 'agent');
        expect(result.Result).toMatchObject({ result: 'done setRegion' });
    });

    it("checks the call against the component's own schema and says what was expected", async () => {
        const result = await rig.Channel.ApplyVerb('setRegion', { topN: 'five' }, 'agent');
        expect(result).toMatchObject({ Success: false, ErrorCode: 'invalid_params' });
        expect(result.Error).toContain('setRegion(region:string, topN?:number)');
        expect(result.Details?.join(' ')).toContain('region');
        expect(handle.Calls).toEqual([]);
    });

    it('a component that does not actually implement the method fails the verb without calling it', async () => {
        handle.Methods.clear();
        const result = await rig.Channel.ApplyVerb('setRegion', { region: 'EMEA' }, 'agent');
        expect(result).toMatchObject({ Success: false, ErrorCode: 'verb_failed' });
        expect(result.Error).toContain('does not implement setRegion');
        expect(handle.Calls).toEqual([]);
    });

    it('a method that throws is reported, not propagated', async () => {
        handle.ThrowOnInvoke = new Error('boom');
        const result = await rig.Channel.ApplyVerb('setRegion', { region: 'EMEA' }, 'agent');
        expect(result).toMatchObject({ Success: false, ErrorCode: 'verb_failed' });
        expect(result.Error).toContain('boom');
    });

    it('bounds what a method returns', async () => {
        handle.MethodResult = { blob: 'x'.repeat(5000) };
        const result = await rig.Channel.ApplyVerb('setRegion', { region: 'EMEA' }, 'agent');
        const returned = ((result.Result as JSONObject)['result'] as JSONObject)['blob'] as string;
        expect(returned.length).toBeLessThan(300);
        expect(returned).toContain('(5000 chars)');
    });

    it('waits (bounded) for a component that is still loading, then runs the verb', async () => {
        const loading = makeRig();
        await open(loading.Channel, V1, { inputs: { year: 1 } });
        const late = new FakeHandle();
        late.IsReady = false;
        late.Methods.add('setRegion');
        loading.Channel.Engine.AttachHandle('c1', late);
        setTimeout(() => (late.IsReady = true), 10);
        const result = await loading.Channel.ApplyVerb('setRegion', { region: 'EMEA' }, 'agent');
        expect(result.Success).toBe(true);
    });

    it('gives up on a component that never becomes ready, and says so', async () => {
        const stuck = makeRig();
        await open(stuck.Channel, V1, { inputs: { year: 1 } });
        const result = await stuck.Channel.ApplyVerb('refresh', {}, 'agent');
        expect(result).toMatchObject({ Success: false, ErrorCode: 'verb_failed' });
        expect(result.Error).toContain('still loading');
    });

    it('runs each standard verb on the handle', async () => {
        handle.Dirty = true;
        handle.ValidateResult = { valid: false, errors: ['Name is required'] };
        handle.DataState = { title: 'Revenue', tables: [{ name: 't', columns: ['a'], rows: [{ a: 1 }] }] };
        expect((await rig.Channel.ApplyVerb('refresh', {}, 'agent')).Result).toMatchObject({ refreshed: true });
        expect((await rig.Channel.ApplyVerb('print', {}, 'agent')).Result).toMatchObject({ printing: true });
        expect((await rig.Channel.ApplyVerb('reset', {}, 'agent')).Result).toMatchObject({ reset: true });
        expect((await rig.Channel.ApplyVerb('is_dirty', {}, 'agent')).Result).toMatchObject({ dirty: true });
        expect((await rig.Channel.ApplyVerb('validate', {}, 'agent')).Result).toMatchObject({ validation: { valid: false, errors: ['Name is required'] } });
        expect((await rig.Channel.ApplyVerb('scroll_to', { target: '#totals' }, 'agent')).Result).toMatchObject({ scrolledTo: '#totals' });
        expect((await rig.Channel.ApplyVerb('scroll_to', { top: 200 }, 'agent')).Result).toMatchObject({ scrolled: true });
        expect((await rig.Channel.ApplyVerb('focus', { target: 'input' }, 'agent')).Result).toMatchObject({ focused: true });
        expect((await rig.Channel.ApplyVerb('get_data_state', {}, 'agent')).Result).toMatchObject({
            data: { title: 'Revenue', tables: [{ name: 't', rowCount: 1, columns: ['a'], rows: [{ a: 1 }] }] },
        });
        expect(handle.Calls).toEqual(['refresh', 'print', 'reset', 'validate', 'scrollTo:"#totals"', 'scrollTo:{"top":200}', 'focus:input']);
    });

    it('scroll_to with neither a target nor an offset is a failure, not a silent no-op', async () => {
        const result = await rig.Channel.ApplyVerb('scroll_to', {}, 'agent');
        expect(result).toMatchObject({ Success: false, ErrorCode: 'verb_failed' });
        expect(result.Error).toContain('scroll_to needs');
    });

    it('get_data_state says so when the component has no data state yet', async () => {
        const result = await rig.Channel.ApplyVerb('get_data_state', {}, 'agent');
        expect(result.Result).toMatchObject({ data: null });
    });

    it('a verb the open component does not have is refused', async () => {
        const result = await rig.Channel.ApplyVerb('explode', {}, 'agent');
        expect(result).toMatchObject({ Success: false, ErrorCode: 'verb_failed' });
    });

    it('an action that changes the component is perceived afterwards; a pure read is not', async () => {
        rig.Log.Notes.length = 0;
        await rig.Channel.ApplyVerb('is_dirty', {}, 'agent');
        rig.Channel.Flush();
        expect(rig.Log.Notes).toEqual([]);
        await rig.Channel.ApplyVerb('reset', {}, 'agent');
        expect(rig.Events.some((e) => e.Name === 'state_changed')).toBe(true);
    });
});

describe('InteractiveComponentChannel: which instance a verb addresses', () => {
    beforeEach(async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => vi.restoreAllMocks());

    async function twoOpen(): Promise<{ rig: Rig; revenue: FakeHandle; pipeline: FakeHandle }> {
        const rig = makeRig();
        await open(rig.Channel, V1, { inputs: { year: 1 } });
        await open(rig.Channel, P1);
        const revenue = mount(rig.Channel, 'c1');
        const pipeline = mount(rig.Channel, 'c2');
        revenue.Methods.add('setRegion');
        pipeline.Methods.add('setRegion');
        return { rig, revenue, pipeline };
    }

    it('without an instance, the one the user is looking at is used when it supports the verb', async () => {
        const { rig, revenue, pipeline } = await twoOpen();
        rig.Channel.Engine.SetActive('c1');
        await rig.Channel.ApplyVerb('setRegion', { region: 'EMEA' }, 'agent');
        expect(revenue.Calls).toHaveLength(1);
        expect(pipeline.Calls).toHaveLength(0);
    });

    it('an explicit instance wins over the active one', async () => {
        const { rig, revenue, pipeline } = await twoOpen();
        rig.Channel.Engine.SetActive('c1');
        await rig.Channel.ApplyVerb('setRegion', { territory: 'EMEA' }, 'agent', 'c2');
        expect(pipeline.Calls).toEqual(['invoke:setRegion(["EMEA"])']);
        expect(revenue.Calls).toHaveLength(0);
    });

    it('with the active one unable to do it, the only component that can is used', async () => {
        const { rig, revenue } = await twoOpen();
        rig.Channel.Engine.SetActive('c2');
        // Only Revenue has get_data_state.
        revenue.DataState = { title: 'Revenue' };
        const result = await rig.Channel.ApplyVerb('get_data_state', {}, 'agent');
        expect(result.Result).toMatchObject({ instance: 'c1' });
    });

    it('when several could and none is active among them, it refuses and lists them', async () => {
        const rig = makeRig();
        const third = MakeArtifact('33333333-3333-3333-3333-333333333333', 'cccccccc-0000-0000-0000-000000000001', 1, MakeSpec({ methods: { standardMethodsSupported: { refresh: true }, customMethods: [] } }));
        rig.Source.Add(third);
        await open(rig.Channel, V1, { inputs: { year: 1 } });
        await open(rig.Channel, P1);
        await open(rig.Channel, third.VersionID);
        // c3 is active and has refresh; ask for setRegion, which c1 and c2 have and c3 does not.
        const result = await rig.Channel.ApplyVerb('setRegion', { region: 'x' }, 'agent');
        expect(result).toMatchObject({ Success: false, ErrorCode: 'ambiguous_instance' });
        expect(result.Details?.[0]).toContain('c1');
        expect(result.Details?.[0]).toContain('c2');
    });
});

describe('InteractiveComponentChannel: what the model perceives', () => {
    beforeEach(() => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => vi.restoreAllMocks());

    it('state is keyed by instance: version, active flag, inputs, and (when supported and ready) a bounded data summary', async () => {
        const { Channel } = makeRig();
        await open(Channel, V1, { inputs: { year: 2026 } });
        await open(Channel, P1);
        const revenue = mount(Channel, 'c1');
        revenue.DataState = { title: 'Revenue', tables: [{ name: 'sales', columns: ['region'], rows: [{ region: 'EMEA' }] }] };
        mount(Channel, 'c2').DataState = { title: 'never described: Pipeline does not report a data state' };
        const state = Channel.GetState() as { components: Record<string, JSONObject> };
        expect(Object.keys(state.components)).toEqual(['c1', 'c2']);
        expect(state.components['c1']).toMatchObject({
            name: 'Revenue dashboard', artifactId: A1, artifactVersionId: V1, versionNumber: 1, active: false, inputs: { year: 2026 },
            data: { title: 'Revenue', tables: [{ name: 'sales', rowCount: 1, columns: ['region'], rows: [{ region: 'EMEA' }] }] },
        });
        expect(state.components['c2']['active']).toBe(true);
        expect(state.components['c2']['data']).toBeUndefined();
    });

    it('does not describe data for a component that is not ready', async () => {
        const { Channel } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        const handle = mount(Channel, 'c1');
        handle.IsReady = false;
        handle.DataState = { title: 'x' };
        expect((Channel.GetState() as { components: Record<string, JSONObject> }).components['c1']['data']).toBeUndefined();
    });

    it('the state matches the descriptor\'s noun schema', async () => {
        const { Channel } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        expect(Channel.ValidateState()).toEqual([]);
    });

    it('a component event is recorded in state, emitted as a typed event with its change id, and perceived as a coalesced note', async () => {
        const { Channel, Events, Log } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        Log.Notes.length = 0;
        Channel.OnComponentActivity('c1', { Kind: 'event', Name: 'rowSelected', Payload: { rowId: 'r-7' } });
        const typed = Events.find((e) => e.Name === 'rowSelected');
        expect(typed).toMatchObject({ Instance: 'c1', Payload: { payload: { rowId: 'r-7' } } });
        expect(typed?.ChangeId).toBeGreaterThan(0);
        Channel.Flush();
        const note = Log.Notes.find((n) => n.includes(' state_changed '));
        expect(note).toMatch(/^\[channel:InteractiveComponent#all\] state_changed /);
        expect(note).toContain('"lastEvent":{"type":"rowSelected","payload":{"rowId":"r-7"}');
    });

    it('a burst of events is one note carrying the latest', async () => {
        const { Channel, Log } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        Log.Notes.length = 0;
        for (const rowId of ['a', 'b', 'c']) {
            Channel.OnComponentActivity('c1', { Kind: 'event', Name: 'rowSelected', Payload: { rowId } });
        }
        Channel.Flush();
        const notes = Log.Notes.filter((n) => n.includes(' state_changed '));
        expect(notes).toHaveLength(1);
        expect(notes[0]).toContain('"changes":3');
        expect(notes[0]).toContain('"rowId":"c"');
    });

    it('bounds an event payload before it reaches the model', async () => {
        const { Channel, Log } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        Log.Notes.length = 0;
        Channel.OnComponentActivity('c1', { Kind: 'event', Name: 'rowSelected', Payload: { huge: 'z'.repeat(10000) } });
        Channel.Flush();
        expect(Log.Notes.find((n) => n.includes(' state_changed '))!.length).toBeLessThan(1200);
    });

    it('selecting a tab makes that instance the active one and is perceived', async () => {
        const { Channel, Log } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        await open(Channel, P1);
        Log.Notes.length = 0;
        Channel.OnComponentActivity('c1', { Kind: 'selected' });
        expect(Channel.Engine.ActiveID).toBe('c1');
        Channel.Flush();
        expect(Log.Notes.some((n) => n.includes('"active":true'))).toBe(true);
    });

    it('the user closing a tab removes the component and is told to observers and the model', async () => {
        const { Channel, Events, Log } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        await open(Channel, P1);
        Log.Notes.length = 0;
        Channel.OnComponentActivity('c2', { Kind: 'closed' });
        expect(Channel.Engine.Instances.map((r) => r.InstanceID)).toEqual(['c1']);
        expect(Events.find((e) => e.Name === 'closed')).toMatchObject({ Instance: 'c2', Payload: { by: 'user' } });
        Channel.Flush();
        expect(Log.Notes.some((n) => n.includes(' state_changed ') && n.includes('c2'))).toBe(true);
    });

    it('activity for an instance that is not open is ignored', async () => {
        const { Channel, Events } = makeRig();
        const before = Events.length;
        Channel.OnComponentActivity('c9', { Kind: 'event', Name: 'x' });
        expect(Events).toHaveLength(before);
    });

    it('data that arrives after an action is described once more shortly afterwards', async () => {
        const { Channel, Log } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        const handle = mount(Channel, 'c1');
        Channel.OnComponentActivity('c1', { Kind: 'initialized' });
        Channel.Flush();
        Log.Notes.length = 0;
        handle.DataState = { title: 'Loaded later' };
        await new Promise((resolve) => setTimeout(resolve, 20));
        Channel.Flush();
        expect(Log.Notes.some((n) => n.includes('Loaded later'))).toBe(true);
    });
});

describe('InteractiveComponentChannel: exposure policy', () => {
    beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => undefined));
    afterEach(() => vi.restoreAllMocks());

    it("at 'none' the model is not told what a component holds: opening, activity and swaps volunteer nothing", async () => {
        const { Channel, Log, Source } = makeRig();
        Channel.ApplyExposure({ Policy: 'none', Reasons: ['this agent limits it'] });
        Log.Notes.length = 0;
        const result = await Channel.Open({ artifactVersionId: V1, inputs: { year: 1 } });
        expect(result.Success).toBe(true);
        expect(Log.Notes.filter((n) => n.includes(' opened '))).toEqual([expect.stringContaining('{"exposure":"none"}')]);
        mount(Channel, 'c1').DataState = { title: 'secret' };
        Channel.OnComponentActivity('c1', { Kind: 'event', Name: 'rowSelected', Payload: { rowId: 'private' } });
        Channel.Flush();
        await Channel.OnDelegationArtifacts([{ ArtifactID: A1, ArtifactVersionID: V2, Name: 'Revenue dashboard' }]);
        Channel.Flush();
        const joined = Log.Notes.join('\n');
        expect(joined).not.toContain('secret');
        expect(joined).not.toContain('private');
        expect(joined).not.toContain(V2);
        expect(Source.Calls.length).toBeGreaterThan(0);
    });

    it("at 'state' the data-returning verbs work", async () => {
        const { Channel } = makeRig();
        Channel.ApplyExposure({ Policy: 'state' });
        await open(Channel, V1, { inputs: { year: 1 } });
        const handle = mount(Channel, 'c1');
        handle.Methods.add('setRegion');
        handle.DataState = { title: 'Asked for' };
        expect((await Channel.ApplyVerb('get_data_state', {}, 'agent')).Result).toMatchObject({ data: { title: 'Asked for' } });
        expect(Channel.Exposure).toBe('state');
    });

    it("at 'none' every verb whose result carries the component's data is refused, and the component is never touched", async () => {
        const { Channel } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        const handle = mount(Channel, 'c1');
        handle.Methods.add('setRegion');
        handle.DataState = { title: 'secret' };
        Channel.ApplyExposure({ Policy: 'none', Reasons: ['this agent requires a zero-data-retention model'] });
        for (const [verb, args] of [['get_data_state', {}], ['validate', {}], ['is_dirty', {}], ['setRegion', { region: 'EMEA' }]] as const) {
            const result = await Channel.ApplyVerb(verb, args, 'agent');
            expect(result).toMatchObject({ Success: false, ErrorCode: 'exposure_restricted', Details: ['this agent requires a zero-data-retention model'] });
            expect(result.Error).toContain(`"${verb}" is unavailable right now`);
            expect(JSON.stringify(result)).not.toContain('secret');
        }
        expect(handle.Calls).toEqual([]);
    });

    it("at 'none' the verbs that only act still work (the agent may drive a component it cannot see)", async () => {
        const { Channel } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        const handle = mount(Channel, 'c1');
        Channel.ApplyExposure({ Policy: 'none' });
        expect((await Channel.ApplyVerb('refresh', {}, 'agent')).Success).toBe(true);
        expect((await Channel.ApplyVerb('reset', {}, 'agent')).Success).toBe(true);
        expect(handle.Calls).toEqual(['refresh', 'reset']);
    });

    it('the user turning the agent\'s view off takes the data verbs away; turning it back on returns them', async () => {
        const { Channel } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        mount(Channel, 'c1').DataState = { title: 'x' };
        Channel.ApplyExposure({ Policy: 'pixels', User: 'none' });
        expect(await Channel.ApplyVerb('get_data_state', {}, 'agent')).toMatchObject({ ErrorCode: 'exposure_restricted' });
        Channel.ApplyExposure({ Policy: 'pixels' });
        expect((await Channel.ApplyVerb('get_data_state', {}, 'agent')).Success).toBe(true);
    });

    it('a user acting through the surface is not restricted', async () => {
        const { Channel } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        mount(Channel, 'c1').DataState = { title: 'x' };
        Channel.ApplyExposure({ Policy: 'none' });
        expect((await Channel.ApplyVerb('get_data_state', {}, 'user')).Success).toBe(true);
    });

    it('the descriptor marks the data-returning verbs, and a void custom method as not returning data', async () => {
        const { Channel } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        await open(Channel, P1);
        const verbs = new Map(Channel.GetDescriptor().Verbs.map((v) => [v.Name, v.ReturnsChannelData]));
        expect(verbs.get('get_data_state')).toBe('state');
        expect(verbs.get('validate')).toBe('state');
        expect(verbs.get('is_dirty')).toBe('state');
        expect(verbs.get('refresh')).toBeUndefined();
        expect(verbs.get('show_version')).toBeUndefined();
        // Revenue's setRegion returns string; Pipeline's returns void: the merged verb is refused only if EVERY component would refuse it.
        expect(verbs.get('setRegion')).toBeUndefined();
    });

    it('a delegated newer version is not announced to a model that may not perceive the channel', async () => {
        const { Channel, Log } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        Channel.ApplyExposure({ Policy: 'none' });
        Log.Notes.length = 0;
        await Channel.OnDelegationArtifacts([{ ArtifactID: A1, ArtifactVersionID: V2, Name: 'Revenue dashboard' }]);
        Channel.Flush();
        expect(Log.Notes.join('\n')).not.toContain(V2);
    });
});

describe('InteractiveComponentChannel: delegated artifacts', () => {
    beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => undefined));
    afterEach(() => vi.restoreAllMocks());

    const artifact = (id: string, versionId: string) => ({ ArtifactID: id, ArtifactVersionID: versionId, Name: 'Built for you' });

    it('is not offered artifacts by default, and says no even when it is configured nowhere', () => {
        const channel = new TestChannel();
        expect(channel.AcceptsDelegationArtifacts([artifact(A1, V1)], {})).toBe(false);
        expect(channel.AcceptsDelegationArtifacts([], { autoOpenDelegatedComponents: true })).toBe(false);
    });

    it('wants them when the operator turned auto-open on', () => {
        const channel = new TestChannel();
        expect(channel.AcceptsDelegationArtifacts([artifact(A1, V1)], { autoOpenDelegatedComponents: true })).toBe(true);
        expect(channel.AcceptsDelegationArtifacts([artifact(A1, V1)], { autoOpenDelegatedComponents: 'true' })).toBe(false);
    });

    it('wants an artifact it already shows, whatever the configuration, so a revision replaces it', async () => {
        const { Channel } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        expect(Channel.AcceptsDelegationArtifacts([artifact(A1, V2)], {})).toBe(true);
        expect(Channel.AcceptsDelegationArtifacts([artifact(A2, P1)], {})).toBe(false);
    });

    it('auto-opens a delegated component artifact like an agent-initiated open', async () => {
        const { Channel, Log, Events } = makeRig({ autoOpenDelegatedComponents: true });
        await Channel.OnDelegationArtifacts([artifact(A2, P1)]);
        expect(Channel.Engine.Instances.map((r) => [r.InstanceID, r.Artifact.VersionID])).toEqual([['c1', P1]]);
        expect(Events.find((e) => e.Name === 'opened')?.Instance).toBe('c1');
        expect(Log.Notes.some((n) => n.includes('#c1] opened'))).toBe(true);
    });

    it('does not open anything unless auto-open is on', async () => {
        const { Channel } = makeRig();
        await Channel.OnDelegationArtifacts([artifact(A2, P1)]);
        expect(Channel.Engine.Instances).toHaveLength(0);
    });

    it('quietly ignores a delegated artifact that is not a component, and logs a real failure', async () => {
        const { Channel, Source } = makeRig({ autoOpenDelegatedComponents: true });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.spyOn(Source, 'LoadVersion')
            .mockRejectedValueOnce(new ComponentArtifactError('not_a_component', 'It is a Report.'))
            .mockRejectedValueOnce(new ComponentArtifactError('access_denied', 'You do not have access to that artifact.'));
        await Channel.OnDelegationArtifacts([artifact(A1, V1), artifact(A2, P1)]);
        expect(Channel.Engine.Instances).toHaveLength(0);
        const messages = warn.mock.calls.map((c) => String(c[0]));
        expect(messages.some((m) => m.includes('It is a Report'))).toBe(false);
        expect(messages.some((m) => m.includes('do not have access'))).toBe(true);
    });

    it('moves an open component to the newer version IN PLACE (same instance), emitting an event and telling the model', async () => {
        const { Channel, Events, Log } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        Log.Notes.length = 0;
        await Channel.OnDelegationArtifacts([artifact(A1, V2)]);
        expect(Channel.Engine.Instances).toHaveLength(1);
        expect(Channel.Engine.Get('c1')?.Artifact).toMatchObject({ VersionID: V2, VersionNumber: 2 });
        expect(Events.find((e) => e.Name === 'version_changed')).toMatchObject({ Instance: 'c1', Payload: { from: V1, to: V2, reason: 'newer-version' } });
        const note = Log.Notes.find((n) => n.includes(' version_changed '));
        expect(note).toMatch(/^\[channel:InteractiveComponent#c1\] version_changed /);
        expect(note).toContain('"reason":"newer-version"');
        expect(note).toContain('setRegion');
    });

    it('ignores a version that is not newer, and the one already shown', async () => {
        const { Channel, Events } = makeRig();
        await open(Channel, V2, { inputs: { year: 1 } });
        await Channel.OnDelegationArtifacts([artifact(A1, V1), artifact(A1, V2)]);
        expect(Events.some((e) => e.Name === 'version_changed')).toBe(false);
        expect(Channel.Engine.Get('c1')?.Artifact.VersionID).toBe(V2);
    });

    it('when told not to swap, it reports that a newer version exists and leaves the component alone', async () => {
        const { Channel, Events, Log } = makeRig({ swapToNewerVersions: false });
        await open(Channel, V1, { inputs: { year: 1 } });
        Log.Notes.length = 0;
        await Channel.OnDelegationArtifacts([artifact(A1, V2)]);
        expect(Channel.Engine.Get('c1')?.Artifact.VersionID).toBe(V1);
        expect(Events.find((e) => e.Name === 'newer_version_available')).toMatchObject({ Instance: 'c1', Payload: { current: V1, available: V2 } });
        expect(Log.Notes.some((n) => n.includes(' newer_version_available '))).toBe(true);
    });

    it('a newer version that cannot be loaded is logged and leaves the component alone', async () => {
        const { Channel, Source } = makeRig();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        await open(Channel, V1, { inputs: { year: 1 } });
        vi.spyOn(Source, 'LoadVersion').mockRejectedValueOnce(new Error('timeout'));
        await Channel.OnDelegationArtifacts([artifact(A1, V2)]);
        expect(Channel.Engine.Get('c1')?.Artifact.VersionID).toBe(V1);
        expect(warn.mock.calls.some((c) => String(c[0]).includes('timeout'))).toBe(true);
    });
});

describe('InteractiveComponentChannel: pixels and lifecycle', () => {
    beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => undefined));
    afterEach(() => {
        ChannelFrameCapture.Instance.Register(null);
        vi.restoreAllMocks();
    });

    it('sources no video track unless the host registered something that can rasterize a component', () => {
        const { Channel } = makeRig();
        expect(Channel.GetSourcedTracks()).toEqual([]);
    });

    it('sources the inbound video track once a frame capturer is registered', () => {
        ChannelFrameCapture.Instance.Register(async () => 'jpeg');
        const { Channel } = makeRig();
        expect(Channel.GetSourcedTracks()).toHaveLength(1);
        expect(Channel.GetSourcedTracks()[0]).toMatchObject({ Modality: 'video', Direction: 'inbound' });
    });

    it('the frame capture holder is a singleton', () => {
        expect(ChannelFrameCapture.Instance).toBe(ChannelFrameCapture.Instance);
    });

    it('binds a surface to the engine and wires its activity hook back to the channel', async () => {
        const { Channel } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        const surface = { Engine: null, AgentName: '', Provider: null, ActivityHandler: null } as unknown as Parameters<InteractiveComponentChannel['BindSurface']>[0];
        Channel.BindSurface(surface);
        expect(surface.Engine).toBe(Channel.Engine);
        expect(surface.AgentName).toBe('Sage');
        surface.ActivityHandler?.('c1', { Kind: 'closed' });
        expect(Channel.Engine.Instances).toHaveLength(0);
        Channel.UnbindSurface();
    });

    it('is live-only: nothing is saved with the session and a resumed session restores nothing', async () => {
        const { Channel } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        expect(Channel.SerializeState()).toBeNull();
        expect(Channel.RestoreState(JSON.stringify({ components: { c1: {} } }))).toBe(false);
        expect(Channel.Engine.Instances).toHaveLength(1); // untouched
    });

    it('is described to the user the first time they see it', () => {
        const { Channel } = makeRig();
        expect(Channel.GetOnboardingDetails()).toMatchObject({ Heading: 'Interactive components' });
        expect(Channel.TabTitle).toBe('Components');
    });

    it('Dispose completes the event stream and closes everything', async () => {
        const { Channel } = makeRig();
        await open(Channel, V1, { inputs: { year: 1 } });
        let completed = false;
        Channel.Events$.subscribe({ complete: () => (completed = true) });
        Channel.Dispose();
        expect(completed).toBe(true);
        expect(Channel.Engine.Instances).toHaveLength(0);
    });
});

describe('InteractiveComponentChannel: showing the model a picture of the component', () => {
    const element = { tag: 'the active pane' } as unknown as HTMLElement;
    type Surface = Parameters<InteractiveComponentChannel['BindSurface']>[0];

    beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => undefined));
    afterEach(() => {
        ChannelFrameCapture.Instance.Register(null);
        vi.restoreAllMocks();
    });

    /** A channel with a capturer registered, a video-capable connection, and a surface whose active pane is `element`. */
    function pictureRig(capturer: (el: HTMLElement) => Promise<string | null>) {
        ChannelFrameCapture.Instance.Register(capturer);
        const client = new FakeVideoClient();
        const log: ChannelLog = { Notes: [] };
        const channel = new TestChannel();
        channel.SetArtifactSource(new FakeArtifactSource().Add(MakeArtifact(A1, V1, 1, REVENUE_SPEC)));
        channel.Initialize(MakeContext(log, {}, client.AsClient()));
        const surface = { Engine: null, AgentName: '', Provider: null, ActivityHandler: null, GetActiveElement: () => element } as unknown as Surface;
        channel.BindSurface(surface);
        const events: RealtimeChannelEvent[] = [];
        channel.Events$.subscribe((e) => events.push(e));
        return { channel, client, events };
    }

    it('hands the active pane to the host rasterizer and returns its frame', async () => {
        const capturer = vi.fn(async () => 'JPEGDATA');
        const { channel } = pictureRig(capturer);
        expect(await channel.Capture()).toBe('JPEGDATA');
        expect(capturer).toHaveBeenCalledWith(element);
    });

    it("never rasterizes unless exposure is 'pixels' (the costly part is skipped, whoever asks)", async () => {
        const capturer = vi.fn(async () => 'JPEGDATA');
        const { channel } = pictureRig(capturer);
        for (const policy of ['state', 'none'] as const) {
            channel.ApplyExposure({ Policy: policy });
            expect(await channel.Capture()).toBeNull();
        }
        channel.ApplyExposure({ Policy: 'pixels', User: 'state' });
        expect(await channel.Capture()).toBeNull();
        expect(capturer).not.toHaveBeenCalled();
    });

    it('never rasterizes without an inbound video track', async () => {
        const capturer = vi.fn(async () => 'JPEGDATA');
        const { channel, client } = pictureRig(capturer);
        client.VideoUp = false;
        expect(await channel.Capture()).toBeNull();
        expect(capturer).not.toHaveBeenCalled();
    });

    it('sends nothing when no surface is bound or nothing is on screen', async () => {
        const capturer = vi.fn(async () => 'JPEGDATA');
        const { channel } = pictureRig(capturer);
        channel.UnbindSurface();
        expect(await channel.Capture()).toBeNull();
        expect(capturer).not.toHaveBeenCalled();
    });

    it('a rasterizer that throws costs the model a frame, never the session, and is logged', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const { channel } = pictureRig(async () => {
            throw new Error('tainted canvas');
        });
        expect(await channel.Capture()).toBeNull();
        expect(error.mock.calls.some((c) => String(c[0]).includes('tainted canvas'))).toBe(true);
    });

    it('end to end: a change the user makes reaches the model as a frame tagged with the change id of the state it shows', async () => {
        const { channel, client, events } = pictureRig(async () => 'FRAME-1');
        await channel.Open({ artifactVersionId: V1, inputs: { year: 1 } });
        channel.OnComponentActivity('c1', { Kind: 'event', Name: 'rowSelected', Payload: { rowId: 'r1' } });
        await vi.waitFor(() => expect(client.Frames.length).toBeGreaterThan(0));
        expect(client.Frames[0]).toMatchObject({ Data: 'FRAME-1', SourceID: 'InteractiveComponent#all' });
        const pushed = events.find((e) => e.Name === 'frame_pushed');
        const changed = events.find((e) => e.Name === 'state_changed'); // the user's change; a later settle re-read is a separate change
        expect(pushed?.ChangeId).toBeDefined();
        expect(pushed?.ChangeId).toBe(changed?.ChangeId);
        expect(client.Notes.filter((n) => n.includes('frame_pushed'))).toEqual([]); // a frame is a picture, not a note
    });

    it('end to end: no frame flows while exposure is state, and one flows again when the user allows pixels', async () => {
        const { channel, client } = pictureRig(async () => 'FRAME-2');
        await channel.Open({ artifactVersionId: V1, inputs: { year: 1 } });
        channel.ApplyExposure({ Policy: 'pixels', User: 'state' });
        channel.OnComponentActivity('c1', { Kind: 'event', Name: 'rowSelected', Payload: { rowId: 'r2' } });
        await new Promise((resolve) => setTimeout(resolve, 30));
        expect(client.Frames).toEqual([]);
        channel.ApplyExposure({ Policy: 'pixels' });
        await vi.waitFor(() => expect(client.Frames.length).toBeGreaterThan(0));
    });
});
