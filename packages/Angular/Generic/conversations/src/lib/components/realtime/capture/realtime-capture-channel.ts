import type { Type } from '@angular/core';
import type { Subscription } from 'rxjs';
import { RegisterClass } from '@memberjunction/global';
import type { JSONObject } from '@memberjunction/ai';
import { REALTIME_CHANNEL_CONTRACT_VERSION, type RealtimeChannelDescriptor, type RealtimeChannelNoun } from '@memberjunction/ai-core-plus';
import {
  BaseRealtimeChannelClient,
  type ChannelExposureSettings,
  type RealtimeCaptureKind,
  type RealtimeChannelVerbResult,
  type RealtimeHostChannelDeclaration,
  type RealtimeSessionStartOptions,
} from '@memberjunction/realtime-runtime';
import { RealtimeCaptureModel, type RealtimeCaptureChange } from './realtime-capture-model';
import { RealtimeCaptureSurfaceComponent } from './realtime-capture-surface.component';

/** The registry keys (`MJ: AI Agent Channels` → `Name` and `ClientPluginClass`) of the two capture channels. */
export const REALTIME_CAMERA_CHANNEL_NAME = 'Camera';
export const REALTIME_SCREEN_SHARE_CHANNEL_NAME = 'ScreenShare';
export const REALTIME_CAMERA_CHANNEL_CLASS = 'RealtimeCameraChannel';
export const REALTIME_SCREEN_SHARE_CHANNEL_CLASS = 'RealtimeScreenShareChannel';

/**
 * The channels the conversations UI brings to its calls: the Camera and Screen Share channels are opt-in, so a call has
 * them only when its host (or the agent's or app's configuration) asks. An agent or app can still exclude them.
 */
export const CONVERSATION_CALL_HOST_CHANNELS: readonly RealtimeHostChannelDeclaration[] = Object.freeze([
  { ClientPluginClass: REALTIME_CAMERA_CHANNEL_CLASS },
  { ClientPluginClass: REALTIME_SCREEN_SHARE_CHANNEL_CLASS },
]);

/**
 * The start options the conversations UI passes with every call it starts: the channels it brings, and the camera check
 * its call overlay shows the first time the user turns the camera on in a call.
 */
export function ConversationCallStartOptions(): RealtimeSessionStartOptions {
  return { HostChannels: [...CONVERSATION_CALL_HOST_CHANNELS], CameraCheck: true };
}

/** What tells the two capture channels apart. */
interface CaptureChannelText {
  Kind: RealtimeCaptureKind;
  Key: string;
  DisplayName: string;
  TabIcon: string;
  Instructions: string;
  Status: string;
  ReasonHint: string;
}

const STATUS_VALUES = ['off', 'asked', 'starting', 'on', 'failed'];

/**
 * A channel that fronts one of the runtime's captures: the user's camera or a shared screen. It is the agent's contract
 * for asking to see it, and the capture's policy (`CaptureKind`): the runtime starts the capture only while this channel
 * is in the call and may show the agent pixels.
 *
 * **The agent only asks.** Opening the channel, with a `reason`, is the request: the channel's surface appears where its
 * registry row places it (picture-in-picture) and shows the ask, with the user's choice of turning it on or "Not now".
 * Only the user starts or stops the capture; the agent learns what happened from the channel's `status`.
 *
 * Both channels are `on-demand` (listed in the agent's catalog, mounted when opened), `opt-in` (a call has them only when
 * its host or configuration asks for them; the conversations UI brings them, see {@link CONVERSATION_CALL_HOST_CHANNELS})
 * and may show the agent pixels. Their server half is the generic `ClientOnlyChannelServer`.
 */
export abstract class RealtimeCaptureChannel extends BaseRealtimeChannelClient<RealtimeCaptureSurfaceComponent> {
  private model: RealtimeCaptureModel | null = null;
  private capturesSub: Subscription | null = null;
  private surfaceSubs: Subscription[] = [];

  /** What makes this channel the camera or the screen share. */
  protected abstract get Text(): CaptureChannelText;

  /** The channel's state. Public so the surface and tests share the one instance. */
  public get Model(): RealtimeCaptureModel {
    this.model ??= new RealtimeCaptureModel(this.CaptureKind);
    return this.model;
  }

  /** The capture this channel fronts. */
  public override get CaptureKind(): RealtimeCaptureKind {
    return this.Text.Kind;
  }

  public get ChannelName(): string {
    return this.Text.Key;
  }

  public override get TabTitle(): string {
    return this.Text.DisplayName;
  }

  public override get TabIcon(): string {
    return this.Text.TabIcon;
  }

  public override GetDescriptor(): RealtimeChannelDescriptor {
    const text = this.Text;
    return {
      Key: text.Key,
      Version: REALTIME_CHANNEL_CONTRACT_VERSION,
      DisplayName: text.DisplayName,
      OwningPackage: '@memberjunction/ng-conversations',
      Instructions: text.Instructions,
      Nouns: this.nouns(text),
      Verbs: [],
      Inputs: {
        type: 'object',
        properties: { reason: { type: 'string', maxLength: 200, description: text.ReasonHint } },
        additionalProperties: false,
      },
      Events: [
        { Name: 'asked', Description: 'Your request is showing to the user.' },
        { Name: 'declined', Description: 'The user said "Not now" to your request.' },
        { Name: 'started', Description: 'The user turned it on; you receive it as video.' },
        { Name: 'stopped', Description: 'The user turned it off.' },
        { Name: 'failed', Description: 'It could not start; the payload says why.' },
      ],
      DisplayPolicy: 'on-demand',
      DefaultAvailability: 'opt-in',
      MaxExposure: 'pixels',
    };
  }

  public override GetState(): JSONObject {
    return this.Model.ToState();
  }

  public override GetSurfaceComponent(): Type<RealtimeCaptureSurfaceComponent> {
    return RealtimeCaptureSurfaceComponent;
  }

  protected override OnInitialize(): void {
    this.Model.OnChange((change) => this.onModelChange(change));
    this.Model.SetAgentCanSee(this.Exposure === 'pixels');
    this.capturesSub =
      this.Context?.Captures$?.subscribe((states) => this.Model.FollowCapture(this.CaptureKind === 'camera' ? states.Camera : states.Screen)) ?? null;
  }

  /** The agent's request: opening the channel, again or for the first time, asks the user. */
  protected override OnOpen(inputs: JSONObject): RealtimeChannelVerbResult {
    const reason = typeof inputs['reason'] === 'string' ? inputs['reason'] : null;
    const asked = this.Model.Ask(reason);
    return { Success: true, Result: { asked, status: this.Model.View.Status } };
  }

  public override ApplyExposure(settings: ChannelExposureSettings): void {
    super.ApplyExposure(settings);
    this.Model.SetAgentCanSee(this.Exposure === 'pixels');
  }

  public override BindSurface(instance: RealtimeCaptureSurfaceComponent): void {
    this.unbindSurfaceOutputs();
    instance.Model = this.Model;
    instance.AgentName = this.Context?.AgentName ?? 'The assistant';
    this.surfaceSubs = [
      instance.StartRequested.subscribe(() => void this.Context?.StartCapture?.(this.CaptureKind)),
      instance.DeclineRequested.subscribe(() => this.Model.Decline()),
      instance.StopRequested.subscribe(() => this.Context?.StopCapture?.(this.CaptureKind)),
      instance.ChangeRequested.subscribe(() => this.changeShare()),
    ];
  }

  public override UnbindSurface(): void {
    this.unbindSurfaceOutputs();
  }

  public override Dispose(): void {
    this.capturesSub?.unsubscribe();
    this.capturesSub = null;
    this.unbindSurfaceOutputs();
    this.Model.OnChange(null);
    super.Dispose();
  }

  /** Streams the change's event, and tells the agent (one coalesced note) what changed. */
  private onModelChange(change: RealtimeCaptureChange): void {
    if (change.Event) {
      this.EmitChannelEvent(change.Event.Name, change.Event.Payload);
    }
    this.RecordChange({ Author: change.Event?.Name === 'asked' ? 'agent' : change.Event ? 'user' : 'system' });
  }

  /** "Change" on a share: stops it and asks the browser's picker again. */
  private changeShare(): void {
    this.Context?.StopCapture?.(this.CaptureKind);
    void this.Context?.StartCapture?.(this.CaptureKind);
  }

  private unbindSurfaceOutputs(): void {
    this.surfaceSubs.forEach((sub) => sub.unsubscribe());
    this.surfaceSubs = [];
  }

  private nouns(text: CaptureChannelText): RealtimeChannelNoun[] {
    const nouns: RealtimeChannelNoun[] = [
      { Name: 'status', Description: text.Status, Schema: { type: 'string', enum: STATUS_VALUES } },
      { Name: 'reason', Description: 'The reason your standing request shows the user, or empty.', Schema: { type: 'string' } },
      { Name: 'problem', Description: 'Why it last failed to start, in plain words, or empty.', Schema: { type: 'string' } },
    ];
    if (this.CaptureKind === 'screen') {
      nouns.push({
        Name: 'surface',
        Description: 'What the user shares while on: their entire screen, a window or a browser tab ("unknown" when the browser does not say).',
        Schema: { type: 'string', enum: ['screen', 'window', 'tab', 'unknown'] },
      });
    }
    return nouns;
  }
}

/** The CAMERA channel: the agent asks to see the user's camera; only the user turns it on or off. */
@RegisterClass(BaseRealtimeChannelClient, REALTIME_CAMERA_CHANNEL_CLASS)
export class RealtimeCameraChannel extends RealtimeCaptureChannel {
  protected override get Text(): CaptureChannelText {
    return {
      Kind: 'camera',
      Key: REALTIME_CAMERA_CHANNEL_NAME,
      DisplayName: 'Camera',
      TabIcon: 'fa-solid fa-video',
      Instructions:
        "The user's camera. To see it, open this channel with a short `reason` the user will read (for example, to look at " +
        'something they are holding). That only asks: the user decides, and only they turn the camera on or off, so never say ' +
        'you turned it on. Once it is on you receive it as video. If the user says no, do not ask again unless they bring it up.',
      Status: 'off; asked (your request is showing); starting; on (you receive the camera); failed (see problem).',
      ReasonHint: 'Why you want to see their camera, in a few words they will read.',
    };
  }
}

/** The SCREEN SHARE channel: the agent asks to see the user's screen; only the user shares or stops. */
@RegisterClass(BaseRealtimeChannelClient, REALTIME_SCREEN_SHARE_CHANNEL_CLASS)
export class RealtimeScreenShareChannel extends RealtimeCaptureChannel {
  protected override get Text(): CaptureChannelText {
    return {
      Kind: 'screen',
      Key: REALTIME_SCREEN_SHARE_CHANNEL_NAME,
      DisplayName: 'Screen share',
      TabIcon: 'fa-solid fa-display',
      Instructions:
        "The user's screen. To see it, open this channel with a short `reason` the user will read (for example, to look at an " +
        'error they mention). That only asks: the user picks a screen, window or tab in their browser and can stop at any ' +
        'time, so never say you started it. Once shared you receive it as video. If the user says no, do not ask again unless ' +
        'they bring it up.',
      Status: 'off; asked (your request is showing); starting (the user is choosing); on (you receive it); failed (see problem).',
      ReasonHint: 'Why you want to see their screen, in a few words they will read.',
    };
  }
}

/**
 * Tree-shaking prevention: the channels are resolved through the ClassFactory by their registry rows' `ClientPluginClass`
 * keys, so this static call keeps their `@RegisterClass` side effects alive.
 */
export function LoadRealtimeCaptureChannels(): void {
  // intentional no-op: the import side effect performs the registration
}
