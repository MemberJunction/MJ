import type { Type } from '@angular/core';
import type { JSONObject, RealtimeToolDefinition } from '@memberjunction/ai';
import {
    REALTIME_CHANNEL_CONTRACT_VERSION,
    type RealtimeChannelActor,
    ValidateJsonAgainstSchemaSubset,
    type RealtimeChannelDescriptor,
    type RealtimeChannelEventSpec,
    type RealtimeChannelVerb,
} from '@memberjunction/ai-core-plus';
import { LogError } from '@memberjunction/core';
import { IsPlainObject, RegisterClass } from '@memberjunction/global';
import {
    BaseRealtimeChannelClient,
    FormatChannelNote,
    FormatParameterList,
    type ChannelOnboardingDetails,
    type ParsedDelegationArtifact,
    type RealtimeChannelVerbResult,
} from '@memberjunction/realtime-runtime';
import { DeriveComponentContract, MergeVerbOffers, type DerivedVerb } from './component-contract';
import { SummarizeDataState, ToBoundedJson } from './component-data-state';
import { ComponentInstanceEngine, InstanceLimitError, type ComponentInstanceRecord } from './component-instance-engine';
import { ParseInteractiveComponentConfig } from './interactive-component-config';
import { InteractiveComponentFrameCapture } from './interactive-component-frame-capture';
import { RealtimeInteractiveComponentSurfaceComponent } from './realtime-interactive-component-surface.component';
import { RunViewComponentArtifactSource } from './run-view-component-artifact-source';
import {
    BUILTIN_VERBS,
    ComponentArtifactError,
    DEFAULT_INTERACTIVE_COMPONENT_CONFIG,
    INTERACTIVE_COMPONENT_CHANNEL_KEY,
    INTERACTIVE_COMPONENT_CLIENT_PLUGIN_CLASS,
    type ComponentActivity,
    type ComponentVersionChangeReason,
    type IComponentArtifactSource,
    type IInteractiveComponentHandle,
    type InteractiveComponentConfig,
    type ResolvedComponentArtifact,
} from './interactive-component-types';

/** How long a verb waits for a freshly opened component to finish initializing (the poll interval times the attempt cap). */
const HANDLE_POLL_INTERVAL_MS = 100;
const HANDLE_POLL_MAX_ATTEMPTS = 80;

/** How long after the user (or the agent) acts the data is read once more, because a component's data arrives after the action that asked for it. */
const DATA_SETTLE_MS = 1200;

/** The events every instance can report, whatever its spec declares. */
const BUILTIN_EVENTS: readonly RealtimeChannelEventSpec[] = [
    { Name: 'opened', Description: 'A component was opened. Carries the inputs it was opened with.' },
    { Name: 'closed', Description: 'A component was closed.' },
    {
        Name: 'version_changed',
        Description: 'A component now shows a different version of its artifact (you asked for it, or a newer version appeared).',
        PayloadSchema: {
            type: 'object',
            properties: {
                from: { type: 'string', description: 'The version id it showed.' },
                to: { type: 'string', description: 'The version id it shows now.' },
                reason: { type: 'string', enum: ['agent', 'newer-version'] },
            },
        },
    },
    {
        Name: 'newer_version_available',
        Description: 'A newer version of an open component exists, and this session is not set to swap to it automatically.',
        PayloadSchema: { type: 'object', properties: { current: { type: 'string' }, available: { type: 'string' } } },
    },
];

/** A failure the dispatcher turns into a message the model can act on. */
function failure(code: string, error: string, details?: string[]): RealtimeChannelVerbResult {
    return details ? { Success: false, ErrorCode: code, Error: error, Details: details } : { Success: false, ErrorCode: code, Error: error };
}

/** A non-empty string argument, or `undefined`. */
function readString(bag: JSONObject, key: string): string | undefined {
    const value = bag[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * The INTERACTIVE COMPONENT channel: shows the user any interactive component artifact (a dashboard, a report, a
 * form, a chart) next to the voice conversation, and lets the agent operate it.
 *
 * It is a MULTI-INSTANCE channel (several components may be open at once, each addressed by `target.instance`) and
 * its contract is DERIVED from what it hosts: the actions an agent can take on an instance are that component's own
 * `customMethods` and the standard methods its spec says it supports; its state is the component's data state;
 * its events are the spec's `events`; the inputs for opening it are the spec's `properties`. A component nobody
 * wrote channel code for is therefore operable from its spec alone. See `DeriveComponentContract`.
 *
 * Built-in: `open { artifactId | artifactVersionId, inputs? }` (the dispatcher's reserved action), `show_version`, `close`.
 *
 * ### What the model perceives
 * Per instance: which artifact version is open, what the user last did in it (its events), and its data state,
 * bounded to a handful of rows. All of it is gated by exposure policy (`min(channel, agent config, zero-data-retention,
 * user)`). Pixels flow only if the host registered a frame capturer ({@link InteractiveComponentFrameCapture}).
 * Agent-INVOKED verbs return what the component returns; exposure gates what is volunteered to the model, not what it
 * asked for.
 *
 * ### Access
 * Artifacts are loaded through the signed-in user's own session and read permission (see `RunViewComponentArtifactSource`).
 * The agent cannot open anything the user cannot.
 *
 * ### Lifetime
 * Open components are live-only: they are not persisted with the session and are not restored on resume.
 */
@RegisterClass(BaseRealtimeChannelClient, INTERACTIVE_COMPONENT_CLIENT_PLUGIN_CLASS)
export class InteractiveComponentChannel extends BaseRealtimeChannelClient<RealtimeInteractiveComponentSurfaceComponent> {
    /** The components that are open. */
    public readonly Engine = new ComponentInstanceEngine(DEFAULT_INTERACTIVE_COMPONENT_CONFIG.MaxInstances);

    /** The resolved configuration; the defaults until {@link Initialize} reads the cascade. */
    public Config: InteractiveComponentConfig = { ...DEFAULT_INTERACTIVE_COMPONENT_CONFIG };

    /** How long a verb waits for a component to initialize; overridable so tests need not sleep. */
    protected HandlePollIntervalMs = HANDLE_POLL_INTERVAL_MS;
    /** How long after an action the data state is re-read; overridable for tests. */
    protected DataSettleMs = DATA_SETTLE_MS;

    private artifactSource: IComponentArtifactSource | null = null;
    private surface: RealtimeInteractiveComponentSurfaceComponent | null = null;
    private settleTimer: ReturnType<typeof setTimeout> | null = null;

    public get ChannelName(): string {
        return INTERACTIVE_COMPONENT_CHANNEL_KEY;
    }

    /**
     * The id state notes carry. A multi-instance channel's snapshot describes ALL its instances (keyed by their own ids,
     * `c1`, `c2`, ...), so the notes about the snapshot as a whole are addressed to `all` rather than to one of them.
     */
    public override get InstanceId(): string {
        return 'all';
    }

    public override get TabTitle(): string {
        return 'Components';
    }

    public override get TabIcon(): string {
        return 'fa-solid fa-cubes';
    }

    /** The channel has no native tools: every verb is reached through the `ContextTool` proxy, because the verbs depend on what is open. */
    public override GetToolDefinitions(): RealtimeToolDefinition[] {
        return [];
    }

    /**
     * Replaces where artifacts are loaded from (a host with its own store, or a test). Without it the channel loads
     * through the session's provider and the signed-in user's access.
     */
    public SetArtifactSource(source: IComponentArtifactSource | null): void {
        this.artifactSource = source;
    }

    // ── Contract: descriptor ───────────────────────────────────────────────────

    /**
     * The channel's self-description. The verbs and events are the built-ins plus those of every component that is
     * open right now, so the contract grows as components are opened and the dispatcher validates against it.
     */
    public override GetDescriptor(): RealtimeChannelDescriptor {
        return {
            Key: this.ChannelName,
            Version: REALTIME_CHANNEL_CONTRACT_VERSION,
            DisplayName: 'Interactive Components',
            OwningPackage: '@memberjunction/ng-conversations',
            Instructions:
                'Shows the user an interactive component (a dashboard, report, chart or form) built as an artifact, next to the conversation. ' +
                'Open one with action "open" and an artifactId (its latest version) or an artifactVersionId. The result lists the actions THAT component supports ' +
                'and the events it reports; use them as actions of this channel. Several components can be open: pass the instance id to say which, ' +
                'otherwise the one the user is looking at is used. You can open components other agents built (they come back as artifacts). ' +
                'You are told what the user is looking at and what they do in it; do not narrate routine changes.',
            Nouns: [
                {
                    Name: 'components',
                    Description:
                        'The open components keyed by instance id: which artifact version each shows, whether it is the one the user is looking at, ' +
                        'what the user last did in it, and (when the component reports one) a bounded summary of its data.',
                    Schema: { type: 'object', additionalProperties: { type: 'object' } },
                },
            ],
            Verbs: this.collectVerbs(),
            Inputs: {
                type: 'object',
                properties: {
                    artifactId: { type: 'string', description: 'The artifact to open (its latest version is shown).' },
                    artifactVersionId: { type: 'string', description: 'A specific artifact version to open (instead of artifactId).' },
                    inputs: { type: 'object', description: 'Values for the component\'s own properties, as its spec declares them.' },
                },
                additionalProperties: false,
            },
            Events: this.collectEvents(),
            DisplayPolicy: 'on-demand',
            DefaultAvailability: 'opt-in',
            MaxExposure: 'pixels',
            MultiInstance: true,
        };
    }

    /** The built-in verbs plus each open component's, merged by name. */
    private collectVerbs(): RealtimeChannelVerb[] {
        const builtins: RealtimeChannelVerb[] = [
            {
                Name: BUILTIN_VERBS.ShowVersion,
                Description: 'Shows another version of an open component\'s own artifact in place (the instance stays open and keeps its id).',
                ParametersSchema: {
                    type: 'object',
                    properties: { versionId: { type: 'string', description: 'The artifact version to show.' } },
                    required: ['versionId'],
                    additionalProperties: false,
                },
                InvokableBy: 'agent',
            },
            {
                Name: BUILTIN_VERBS.Close,
                Description: 'Closes an open component.',
                ParametersSchema: { type: 'object', properties: {}, additionalProperties: false },
                InvokableBy: 'agent',
            },
        ];
        const byName = new Map<string, Array<{ Component: string; Verb: RealtimeChannelVerb }>>();
        for (const record of this.Engine.Instances) {
            for (const derived of record.Contract.Verbs) {
                const key = derived.Verb.Name.toLowerCase();
                const offers = byName.get(key) ?? [];
                offers.push({ Component: record.Artifact.Name, Verb: derived.Verb });
                byName.set(key, offers);
            }
        }
        return [...builtins, ...[...byName.values()].map((offers) => MergeVerbOffers(offers))];
    }

    /** The built-in events plus each open component's declared ones. */
    private collectEvents(): RealtimeChannelEventSpec[] {
        const events = new Map<string, RealtimeChannelEventSpec>(BUILTIN_EVENTS.map((e) => [e.Name.toLowerCase(), e]));
        for (const record of this.Engine.Instances) {
            for (const event of record.Contract.Events) {
                if (!events.has(event.Name.toLowerCase())) {
                    events.set(event.Name.toLowerCase(), event);
                }
            }
        }
        return [...events.values()];
    }

    public override GetOnboardingDetails(): ChannelOnboardingDetails {
        return {
            Heading: 'Interactive components',
            Description:
                'The agent can open an interactive component — a dashboard, report or form — right here during the call, and work with it alongside you.',
            Tips: [
                'Switch between open components using the tabs along the top.',
                'The agent sees what you select and change, so you can say "this one" and point.',
                'Use the "Agent can see" control to limit what the agent perceives.',
            ],
            IconClass: 'fa-solid fa-cubes',
        };
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    protected override OnInitialize(): void {
        const parsed = ParseInteractiveComponentConfig(this.Context?.ChannelConfig);
        this.Config = parsed.Config;
        this.Engine.SetMaxInstances(this.Config.MaxInstances);
        for (const problem of parsed.Problems) {
            console.warn(`[RealtimeChannel:${INTERACTIVE_COMPONENT_CHANNEL_KEY}] Configuration: ${problem}`);
        }
        if (!this.artifactSource) {
            const provider = this.Context?.Provider;
            const user = provider?.CurrentUser;
            if (provider && user) {
                this.artifactSource = new RunViewComponentArtifactSource(provider, user);
            }
        }
        this.enableVisualPerceptionIfAvailable();
    }

    /** Opts into pixels only when the host registered something that can rasterize a component. */
    private enableVisualPerceptionIfAvailable(): void {
        const capturer = InteractiveComponentFrameCapture.Instance.Capturer;
        if (!capturer) {
            return;
        }
        this.EnableVisualPerception({
            GetLatestFrame: async () => {
                const element = this.surface?.GetActiveElement() ?? null;
                if (!element) {
                    return null;
                }
                try {
                    return await capturer(element);
                } catch (error) {
                    LogError(`[RealtimeChannel:${INTERACTIVE_COMPONENT_CHANNEL_KEY}] Capturing a component frame failed: ${error instanceof Error ? error.message : String(error)}`);
                    return null;
                }
            },
        });
    }

    public override GetSurfaceComponent(): Type<RealtimeInteractiveComponentSurfaceComponent> {
        return RealtimeInteractiveComponentSurfaceComponent;
    }

    /** Hands the dynamically created surface the engine it renders and the hooks it reports through. */
    public override BindSurface(instance: RealtimeInteractiveComponentSurfaceComponent): void {
        this.surface = instance;
        instance.Engine = this.Engine;
        instance.AgentName = this.Context?.AgentName ?? 'The agent';
        instance.Provider = this.Context?.Provider ?? null;
        instance.ActivityHandler = (instanceId: string, activity: ComponentActivity) => this.OnComponentActivity(instanceId, activity);
    }

    public override UnbindSurface(): void {
        this.surface = null;
    }

    public override Dispose(): void {
        if (this.settleTimer !== null) {
            clearTimeout(this.settleTimer);
            this.settleTimer = null;
        }
        this.surface = null;
        this.Engine.Dispose();
        super.Dispose();
    }

    // ── Contract: state ────────────────────────────────────────────────────────

    /** The open components, keyed by instance id (see the `components` noun). A pure read. */
    public override GetState(): JSONObject {
        const components: JSONObject = {};
        for (const record of this.Engine.Instances) {
            components[record.InstanceID] = this.describeForState(record);
        }
        return { components };
    }

    /** One instance as the model perceives it. */
    private describeForState(record: ComponentInstanceRecord): JSONObject {
        const entry: JSONObject = {
            name: record.Artifact.Name,
            artifactId: record.Artifact.ArtifactID,
            artifactVersionId: record.Artifact.VersionID,
            versionNumber: record.Artifact.VersionNumber,
            active: this.Engine.ActiveID === record.InstanceID,
        };
        if (Object.keys(record.Inputs).length > 0) {
            entry['inputs'] = ToBoundedJson(record.Inputs);
        }
        if (record.LastEvent) {
            entry['lastEvent'] = { type: record.LastEvent.Type, payload: record.LastEvent.Payload, seq: record.LastEvent.Seq };
        }
        if (record.Contract.SupportsDataState && record.Handle?.IsReady) {
            const data = SummarizeDataState(record.Handle.GetCurrentDataState(), {
                MaxRows: this.Config.MaxStateRows,
                MaxChars: this.Config.MaxStateChars,
            });
            if (data) {
                entry['data'] = data;
            }
        }
        return entry;
    }

    // ── Opening ────────────────────────────────────────────────────────────────

    /**
     * Loads the artifact and opens it as a new instance (or, when that artifact is already open, brings the existing
     * instance forward and moves it to the requested version). Refusals are structured results, never exceptions.
     */
    protected override async OnOpen(inputs: JSONObject): Promise<RealtimeChannelVerbResult> {
        const artifactId = readString(inputs, 'artifactId');
        const versionId = readString(inputs, 'artifactVersionId');
        if ((artifactId === undefined) === (versionId === undefined)) {
            return failure('invalid_params', 'Provide exactly one of artifactId (the latest version) or artifactVersionId (a specific version).');
        }
        const source = this.artifactSource;
        if (!source) {
            return failure('open_failed', 'Components cannot be loaded in this session (no signed-in user to load them for).');
        }
        let artifact: ResolvedComponentArtifact;
        try {
            artifact = versionId ? await source.LoadVersion(versionId) : await source.LoadLatest(artifactId as string);
        } catch (error) {
            return this.mapLoadFailure(error);
        }
        const existing = this.Engine.FindByArtifact(artifact.ArtifactID);
        if (existing) {
            return this.reuseOpenInstance(existing, artifact);
        }
        return this.addInstance(artifact, inputs);
    }

    /** Opens a new instance for a loaded artifact. */
    private addInstance(artifact: ResolvedComponentArtifact, inputs: JSONObject): RealtimeChannelVerbResult {
        const componentInputs = IsPlainObject(inputs['inputs']) ? (inputs['inputs'] as JSONObject) : {};
        const contractIssues = ValidateJsonAgainstSchemaSubset(componentInputs, this.inputsSchemaFor(artifact), '$.inputs');
        if (contractIssues.length > 0) {
            return failure('invalid_params', `The inputs for "${artifact.Name}" are invalid.`, contractIssues);
        }
        try {
            const record = this.Engine.Add(artifact, componentInputs);
            return { Success: true, Instance: record.InstanceID, Result: this.describeOpened(record) };
        } catch (error) {
            if (error instanceof InstanceLimitError) {
                return failure('open_failed', error.message, [`open: ${this.Engine.Instances.map((r) => `${r.InstanceID} (${r.Artifact.Name})`).join(', ')}`]);
            }
            throw error;
        }
    }

    /** The inputs schema a freshly derived contract would have, so opening is validated before an instance exists. */
    private inputsSchemaFor(artifact: ResolvedComponentArtifact): JSONObject {
        return DeriveComponentContract(artifact.Spec).InputsSchema;
    }

    /** An artifact that is already open is not opened twice: focus it, and show the requested version. */
    private async reuseOpenInstance(existing: ComponentInstanceRecord, artifact: ResolvedComponentArtifact): Promise<RealtimeChannelVerbResult> {
        this.Engine.SetActive(existing.InstanceID);
        if (existing.Artifact.VersionID !== artifact.VersionID) {
            this.swapVersion(existing, artifact, 'agent');
        }
        return {
            Success: true,
            Instance: existing.InstanceID,
            Result: { ...this.describeOpened(existing), alreadyOpen: true },
        };
    }

    /** What the agent is told when it opens (or revisits) a component: how to operate it. */
    private describeOpened(record: ComponentInstanceRecord): JSONObject {
        return {
            artifactId: record.Artifact.ArtifactID,
            artifactVersionId: record.Artifact.VersionID,
            versionNumber: record.Artifact.VersionNumber,
            name: record.Artifact.Name,
            actions: record.Contract.Verbs.map((v) => `${v.Verb.Name}(${FormatParameterList(v.Verb.ParametersSchema)}) — ${v.Verb.Description}`),
            events: record.Contract.Events.map((e) => e.Name),
            ...(record.Contract.Skipped.length > 0
                ? { unavailable: record.Contract.Skipped.map((s) => `${s.Name}: ${s.Reason}`) }
                : {}),
        };
    }

    /** Maps a failed artifact load to a result the model can act on. */
    private mapLoadFailure(error: unknown): RealtimeChannelVerbResult {
        if (error instanceof ComponentArtifactError) {
            return failure(error.Code === 'invalid_id' ? 'invalid_params' : 'open_failed', error.message, [error.Code]);
        }
        LogError(`[RealtimeChannel:${INTERACTIVE_COMPONENT_CHANNEL_KEY}] Loading a component artifact failed: ${error instanceof Error ? error.message : String(error)}`);
        return failure('open_failed', 'That artifact could not be loaded.');
    }

    // ── Delegated artifacts ────────────────────────────────────────────────────

    /**
     * Asks to be offered a delegated run's artifacts when the operator turned on auto-open, or when one of them is
     * already open here (so a revised version replaces it). Whether an artifact is a component is only known once it
     * is loaded, so with auto-open on the channel is mounted for any delegated artifact and ignores the ones that are not.
     */
    public override AcceptsDelegationArtifacts(artifacts: readonly ParsedDelegationArtifact[], config: JSONObject): boolean {
        if (artifacts.some((a) => this.Engine.FindByArtifact(a.ArtifactID))) {
            return true;
        }
        return artifacts.length > 0 && ParseInteractiveComponentConfig(config).Config.AutoOpenDelegatedComponents;
    }

    /**
     * Takes a delegated run's artifacts: an artifact that is already open moves to its newer version (or, when the
     * configuration says not to swap, the agent is told one exists); with auto-open on, a component that is not open is opened.
     */
    public override async OnDelegationArtifacts(artifacts: readonly ParsedDelegationArtifact[]): Promise<void> {
        for (const artifact of artifacts) {
            const open = this.Engine.FindByArtifact(artifact.ArtifactID);
            if (open) {
                await this.takeNewerVersion(open, artifact);
            } else if (this.Config.AutoOpenDelegatedComponents) {
                await this.autoOpen(artifact);
            }
        }
    }

    /** Opens a delegated artifact; one that is not a component is ignored (expected), anything else is logged. */
    private async autoOpen(artifact: ParsedDelegationArtifact): Promise<void> {
        const opened = await this.Open({ artifactVersionId: artifact.ArtifactVersionID });
        if (!opened.Success && !(opened.Details ?? []).includes('not_a_component')) {
            console.warn(`[RealtimeChannel:${INTERACTIVE_COMPONENT_CHANNEL_KEY}] Could not open delegated artifact "${artifact.Name}": ${opened.Error ?? opened.ErrorCode}`);
        }
    }

    /** Moves an open instance to the version a delegated run produced, when that version is newer. */
    private async takeNewerVersion(open: ComponentInstanceRecord, artifact: ParsedDelegationArtifact): Promise<void> {
        if (open.Artifact.VersionID.toLowerCase() === artifact.ArtifactVersionID.toLowerCase() || !this.artifactSource) {
            return;
        }
        let loaded: ResolvedComponentArtifact;
        try {
            loaded = await this.artifactSource.LoadVersion(artifact.ArtifactVersionID);
        } catch (error) {
            console.warn(`[RealtimeChannel:${INTERACTIVE_COMPONENT_CHANNEL_KEY}] Could not load the newer version of "${open.Artifact.Name}": ${error instanceof Error ? error.message : String(error)}`);
            return;
        }
        if (loaded.VersionNumber <= open.Artifact.VersionNumber) {
            return;
        }
        if (this.Config.SwapToNewerVersions) {
            this.swapVersion(open, loaded, 'newer-version');
        } else {
            this.EmitChannelEvent('newer_version_available', { current: open.Artifact.VersionID, available: loaded.VersionID }, undefined, open.InstanceID);
            if (this.Exposure !== 'none') {
                this.Context?.SendContextNote(
                    FormatChannelNote(INTERACTIVE_COMPONENT_CHANNEL_KEY, open.InstanceID, 'newer_version_available', {
                        current: open.Artifact.VersionID,
                        available: loaded.VersionID,
                    })
                );
            }
        }
    }

    // ── Version swap ───────────────────────────────────────────────────────────

    /** Shows another version in an existing instance, keeping its id; tells observers, and the model when it did not ask. */
    private swapVersion(record: ComponentInstanceRecord, artifact: ResolvedComponentArtifact, reason: ComponentVersionChangeReason): void {
        const from = record.Artifact.VersionID;
        this.Engine.SwapVersion(record.InstanceID, artifact);
        const payload: JSONObject = { from, to: artifact.VersionID, reason };
        this.EmitChannelEvent('version_changed', payload, undefined, record.InstanceID);
        if (reason === 'newer-version' && this.Exposure !== 'none') {
            this.Context?.SendContextNote(
                FormatChannelNote(INTERACTIVE_COMPONENT_CHANNEL_KEY, record.InstanceID, 'version_changed', {
                    ...payload,
                    actions: record.Contract.Verbs.map((v) => v.Verb.Name),
                })
            );
        }
        this.RecordChange({ Author: reason === 'agent' ? 'agent' : 'system' });
    }

    // ── Verbs ──────────────────────────────────────────────────────────────────

    /**
     * Runs one verb. The dispatcher has already checked the verb against the (merged) descriptor; the exact check against
     * the addressed component's own schema happens here.
     */
    public override async ApplyVerb(
        verb: string,
        args: JSONObject,
        actor: RealtimeChannelActor,
        instanceId?: string
    ): Promise<RealtimeChannelVerbResult> {
        const name = verb.trim().toLowerCase();
        const target = this.resolveInstance(name, instanceId);
        if ('Success' in target) {
            return target;
        }
        if (name === BUILTIN_VERBS.ShowVersion) {
            return this.showVersion(target, args);
        }
        if (name === BUILTIN_VERBS.Close) {
            return this.closeInstance(target);
        }
        return this.invokeDerived(target, name, args, actor);
    }

    /**
     * Finds the instance a verb addresses: the one named, else the one the user is looking at when it supports the verb,
     * else the only one that does. Anything else is a refusal that lists what would have worked.
     */
    private resolveInstance(verb: string, instanceId: string | undefined): ComponentInstanceRecord | RealtimeChannelVerbResult {
        const supports = (r: ComponentInstanceRecord): boolean =>
            verb === BUILTIN_VERBS.ShowVersion || verb === BUILTIN_VERBS.Close || r.Contract.Verbs.some((v) => v.Verb.Name.toLowerCase() === verb);
        if (instanceId !== undefined) {
            const named = this.Engine.Get(instanceId);
            if (!named) {
                return failure('unknown_instance', `No component "${instanceId}" is open.`, [`open: ${this.listOpen()}`]);
            }
            return supports(named) ? named : failure('verb_failed', `"${named.Artifact.Name}" has no action "${verb}".`);
        }
        const candidates = this.Engine.Instances.filter(supports);
        const active = candidates.find((r) => r.InstanceID === this.Engine.ActiveID);
        if (active) {
            return active;
        }
        if (candidates.length === 1) {
            return candidates[0];
        }
        if (candidates.length === 0) {
            return failure('verb_failed', `No open component has an action "${verb}".`, [`open: ${this.listOpen() || 'nothing'}`]);
        }
        return failure('ambiguous_instance', `Several open components have "${verb}"; say which with the instance.`, [`open: ${this.listOpen()}`]);
    }

    /** `c1 (Revenue), c2 (Pipeline)`. */
    private listOpen(): string {
        return this.Engine.Instances.map((r) => `${r.InstanceID} (${r.Artifact.Name})`).join(', ');
    }

    /** `show_version`: swap an instance to another version of ITS artifact. */
    private async showVersion(record: ComponentInstanceRecord, args: JSONObject): Promise<RealtimeChannelVerbResult> {
        const versionId = readString(args, 'versionId');
        if (!versionId || !this.artifactSource) {
            return failure('invalid_params', versionId ? 'Components cannot be loaded in this session.' : 'show_version needs a versionId.');
        }
        let loaded: ResolvedComponentArtifact;
        try {
            loaded = await this.artifactSource.LoadVersion(versionId);
        } catch (error) {
            return this.mapLoadFailure(error);
        }
        if (loaded.ArtifactID.toLowerCase() !== record.Artifact.ArtifactID.toLowerCase()) {
            return failure('verb_failed', `That version belongs to a different artifact ("${loaded.Name}"). Open it with "open" instead.`);
        }
        if (loaded.VersionID.toLowerCase() === record.Artifact.VersionID.toLowerCase()) {
            return { Success: true, Result: { changed: false, instance: record.InstanceID, versionNumber: loaded.VersionNumber } };
        }
        this.swapVersion(record, loaded, 'agent');
        return { Success: true, Result: { changed: true, instance: record.InstanceID, ...this.describeOpened(record) } };
    }

    /** `close`. */
    private closeInstance(record: ComponentInstanceRecord): RealtimeChannelVerbResult {
        const name = record.Artifact.Name;
        this.Engine.Remove(record.InstanceID);
        this.EmitChannelEvent('closed', { name }, undefined, record.InstanceID);
        this.RecordChange({ Author: 'agent' });
        return { Success: true, Result: { closed: true, instance: record.InstanceID } };
    }

    /** Runs a verb derived from the component's spec. */
    private async invokeDerived(
        record: ComponentInstanceRecord,
        name: string,
        args: JSONObject,
        actor: RealtimeChannelActor
    ): Promise<RealtimeChannelVerbResult> {
        const derived = record.Contract.Verbs.find((v) => v.Verb.Name.toLowerCase() === name);
        if (!derived) {
            return failure('verb_failed', `"${record.Artifact.Name}" has no action "${name}".`);
        }
        const issues = ValidateJsonAgainstSchemaSubset(args, derived.Verb.ParametersSchema);
        if (issues.length > 0) {
            return failure(
                'invalid_params',
                `The parameters for ${derived.Verb.Name} on "${record.Artifact.Name}" are invalid. Expected ${derived.Verb.Name}(${FormatParameterList(derived.Verb.ParametersSchema)}).`,
                issues
            );
        }
        const handle = await this.waitForHandle(record);
        if (!handle) {
            return failure('verb_failed', `"${record.Artifact.Name}" is still loading. Try again in a moment.`);
        }
        try {
            const result = await this.runBinding(record, handle, derived, args);
            this.afterAction(record, derived, actor);
            return { Success: true, Result: { instance: record.InstanceID, ...result } };
        } catch (error) {
            console.error(`[RealtimeChannel:${INTERACTIVE_COMPONENT_CHANNEL_KEY}] ${derived.Verb.Name} on "${record.Artifact.Name}" threw:`, error);
            return failure('verb_failed', `${derived.Verb.Name} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /** Waits (bounded) for the surface to mount the component and report it ready. */
    private async waitForHandle(record: ComponentInstanceRecord): Promise<IInteractiveComponentHandle | null> {
        for (let attempt = 0; attempt < HANDLE_POLL_MAX_ATTEMPTS; attempt++) {
            if (record.Handle?.IsReady) {
                return record.Handle;
            }
            if (!this.Engine.Get(record.InstanceID)) {
                return null;
            }
            await new Promise((resolve) => setTimeout(resolve, this.HandlePollIntervalMs));
        }
        return record.Handle?.IsReady ? record.Handle : null;
    }

    /** Executes a derived verb against the live component and returns what to tell the model. */
    private async runBinding(
        record: ComponentInstanceRecord,
        handle: IInteractiveComponentHandle,
        derived: DerivedVerb,
        args: JSONObject
    ): Promise<JSONObject> {
        const binding = derived.Binding;
        if (binding.Kind === 'custom') {
            if (!handle.HasMethod(binding.Method)) {
                throw new Error(`the component does not implement ${binding.Method}`);
            }
            const positional = binding.ParameterNames.map((n) => args[n]);
            const returned = await handle.InvokeMethod(binding.Method, positional);
            return { result: ToBoundedJson(returned) };
        }
        switch (binding.Standard) {
            case 'Refresh':
                handle.Refresh();
                return { refreshed: true };
            case 'Print':
                handle.Print();
                return { printing: true };
            case 'Validate':
                return { validation: ToBoundedJson(handle.Validate()) };
            case 'IsDirty':
                return { dirty: handle.IsDirty() };
            case 'Reset':
                handle.Reset();
                return { reset: true };
            case 'ScrollTo':
                return this.scrollTo(handle, args);
            case 'Focus':
                handle.Focus(readString(args, 'target'));
                return { focused: true };
            case 'GetDataState': {
                const data = SummarizeDataState(handle.GetCurrentDataState(), {
                    MaxRows: this.Config.MaxStateRows,
                    MaxChars: this.Config.MaxStateChars,
                });
                return data ? { data } : { data: null, note: 'The component has no data state yet.' };
            }
            default:
                throw new Error(`unsupported standard action ${String(binding.Standard)} on ${record.Artifact.Name}`);
        }
    }

    /** `scroll_to`: a selector, or an offset. */
    private scrollTo(handle: IInteractiveComponentHandle, args: JSONObject): JSONObject {
        const target = readString(args, 'target');
        if (target !== undefined) {
            handle.ScrollTo(target);
            return { scrolledTo: target };
        }
        const top = typeof args['top'] === 'number' ? args['top'] : undefined;
        const left = typeof args['left'] === 'number' ? args['left'] : undefined;
        if (top === undefined && left === undefined) {
            throw new Error('scroll_to needs a target selector or a top/left offset');
        }
        handle.ScrollTo({ top, left });
        return { scrolled: true };
    }

    /** What happens after a verb ran: the state may have changed, and the picture may have too. */
    private afterAction(record: ComponentInstanceRecord, derived: DerivedVerb, actor: RealtimeChannelActor): void {
        const readOnly =
            derived.Binding.Kind === 'standard' &&
            (derived.Binding.Standard === 'GetDataState' || derived.Binding.Standard === 'IsDirty' || derived.Binding.Standard === 'Validate' || derived.Binding.Standard === 'Print');
        if (readOnly) {
            return;
        }
        this.Engine.SetActive(record.InstanceID);
        this.RecordChange({ Author: actor });
        this.scheduleSettle(actor);
        void this.ConfirmVisualChange();
    }

    // ── What the user does ─────────────────────────────────────────────────────

    /**
     * Called by the surface when something happens inside a rendered component: an event it emits, a state change,
     * or the end of its initialization. Becomes a change in the state the model perceives and a typed event for observers.
     */
    public OnComponentActivity(instanceId: string, activity: ComponentActivity): void {
        const record = this.Engine.Get(instanceId);
        if (!record) {
            return;
        }
        if (activity.Kind === 'closed') {
            this.userClosed(record);
            return;
        }
        if (activity.Kind === 'selected') {
            if (this.Engine.ActiveID !== instanceId) {
                this.Engine.SetActive(instanceId);
                this.RecordChange({ Author: 'user' });
                void this.NotifyVisualChange();
            }
            return;
        }
        if (activity.Kind === 'event' && activity.Name) {
            this.Engine.RecordEvent(instanceId, activity.Name, ToBoundedJson(activity.Payload));
        }
        const changeId = this.RecordChange({ Author: activity.Kind === 'initialized' ? 'system' : 'user' });
        if (activity.Kind === 'event' && activity.Name) {
            this.EmitChannelEvent(activity.Name, { payload: ToBoundedJson(activity.Payload) }, changeId, instanceId);
        }
        this.scheduleSettle('user');
        void this.NotifyVisualChange();
    }

    /** The user closed a component's tab. */
    private userClosed(record: ComponentInstanceRecord): void {
        const name = record.Artifact.Name;
        this.Engine.Remove(record.InstanceID);
        this.EmitChannelEvent('closed', { name, by: 'user' }, undefined, record.InstanceID);
        this.RecordChange({ Author: 'user' });
    }

    /**
     * A component's data usually arrives AFTER the action that asked for it, so the state is described once more shortly
     * afterward. One timer covers a burst.
     */
    private scheduleSettle(author: RealtimeChannelActor): void {
        if (this.settleTimer !== null || this.Exposure === 'none') {
            return;
        }
        this.settleTimer = setTimeout(() => {
            this.settleTimer = null;
            this.RecordChange({ Author: author });
        }, this.DataSettleMs);
    }
}

/**
 * Tree-shaking prevention: the channel is resolved through the ClassFactory by the registry row's `ClientPluginClass`
 * key, so this static call keeps its `@RegisterClass` side effect from being eliminated by the bundler. Called alongside
 * `LoadRealtimeMediaChannel()`.
 */
export function LoadRealtimeInteractiveComponentChannel(): void {
    // intentional no-op: the import side effect performs the registration
}
