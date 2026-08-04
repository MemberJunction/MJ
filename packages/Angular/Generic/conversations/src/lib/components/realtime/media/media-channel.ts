import type { Type } from '@angular/core';
import { Subscription } from 'rxjs';
import { RegisterClass } from '@memberjunction/global';
import { RealtimeToolDefinition } from '@memberjunction/ai';
import { BaseRealtimeChannelClient, ChannelOnboardingDetails } from '../channels/base-realtime-channel-client';
import { MEDIA_TOOL_DEFINITIONS, MEDIA_TOOL_NAMES, MEDIA_TOOL_PREFIX } from './media-channel-tools';
import { MediaChannelState, MediaHighlight, MediaItemType } from './media-channel-state';
import { RealtimeMediaSurfaceComponent } from './realtime-media-surface.component';

/** A JSON-serializable value (the building block of a parsed tool-args object). */
type ToolArgValue = string | number | boolean | null | ToolArgValue[] | { [key: string]: ToolArgValue };

/** Coerces a parsed arg to a non-empty string, or `undefined` when absent / wrong-typed. */
function asString(value: ToolArgValue | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Coerces a parsed arg to a finite number, or `undefined` when absent / wrong-typed. */
function asNumber(value: ToolArgValue | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** The media types `Media_ShowMedia` accepts (validated before mutating state). */
const VALID_MEDIA_TYPES: MediaItemType[] = ['image', 'video', 'audio', 'pdf', 'web'];

/**
 * The shared MEDIA SURFACE as a pluggable interactive channel — a {@link BaseRealtimeChannelClient}
 * resolved from the `MJ: AI Agent Channels` registry row whose `ClientPluginClass` is
 * `'RealtimeMediaChannel'`. One instance per session (created via ClassFactory at session start).
 *
 * It owns a {@link MediaChannelState} engine and contributes the channel's full contract:
 *
 *  - **Action**: the `Media_*` client-executed tool set ({@link MEDIA_TOOL_DEFINITIONS});
 *    {@link ApplyAgentTool} parses the args, mutates the state engine, returns a short JSON result
 *    string, and sends the model a `[media]` background context note (so it stays aware of what's
 *    on screen). Works with NO surface bound — the tools mutate the state engine directly.
 *  - **Surface**: {@link RealtimeMediaSurfaceComponent}, created dynamically by the overlay's
 *    channel tab; {@link BindSurface} hands it the shared state engine + agent name.
 *  - **State of record**: every mutation requests a debounced save of {@link MediaChannelState.ToJSON}
 *    under channel name `'Media'`; a prior session's media is rehydrated via {@link RestoreState}.
 *
 * Modeled directly on `RealtimeWhiteboardChannel`.
 */
@RegisterClass(BaseRealtimeChannelClient, 'RealtimeMediaChannel')
export class RealtimeMediaChannel extends BaseRealtimeChannelClient<RealtimeMediaSurfaceComponent> {
  /** The media state of record — created fresh with the plugin (one per session). */
  public readonly State = new MediaChannelState();

  /** The live bound surface, when the channel tab's pane is instantiated. */
  private surface: RealtimeMediaSurfaceComponent | null = null;
  /** Media-mutation subscription driving the debounced state-of-record save. */
  private stateChangedSub: Subscription | null = null;

  public get ChannelName(): string {
    return 'Media';
  }

  public get ToolNamePrefix(): string {
    return MEDIA_TOOL_PREFIX;
  }

  public get TabTitle(): string {
    return 'Media';
  }

  public get TabIcon(): string {
    return 'fa-solid fa-images';
  }

  public GetToolDefinitions(): RealtimeToolDefinition[] {
    return MEDIA_TOOL_DEFINITIONS;
  }

  public override GetSurfaceComponent(): Type<RealtimeMediaSurfaceComponent> {
    return RealtimeMediaSurfaceComponent;
  }

  /** First-run intro shown the first time the user opens the Media tab (once per user). */
  public override GetOnboardingDetails(): ChannelOnboardingDetails {
    return {
      Heading: 'Media',
      Description:
        'A shared surface where the agent can show you visuals during the call — images, videos, ' +
        'audio clips, PDFs and web pages. Each item opens in its own tab; the agent can switch ' +
        'between them and highlight regions to point at exactly what it means.',
      Tips: [
        'Switch between shared items using the tabs along the top.',
        'The agent can highlight part of an image or page to draw your eye to it.',
        'Open any item in a new browser tab or download it from the toolbar.',
      ],
      IconClass: 'fa-solid fa-images',
    };
  }

  /** Persist the media surface (host-debounced) on EVERY mutation — agent tools and tab changes. */
  protected override OnInitialize(): void {
    this.stateChangedSub = this.State.Changed$.subscribe(() => {
      this.Context?.RequestSave(this.State.ToJSON());
    });
  }

  /**
   * Wires the dynamically-created media surface (before first CD): shared state engine + agent name,
   * plus the live session's MJ provider so FileID-backed items stream securely (mj-storage-media-player
   * + CreateMediaAccessToken) under the SAME authenticated, multi-provider-safe provider.
   */
  public BindSurface(instance: RealtimeMediaSurfaceComponent): void {
    this.surface = instance;
    instance.State = this.State;
    instance.AgentName = this.Context?.AgentName ?? 'The agent';
    instance.Provider = this.Context?.Provider ?? null;
  }

  public override UnbindSurface(): void {
    this.surface = null;
  }

  /**
   * Executes one `Media_*` tool call LOCALLY: parse args, mutate the state engine, push a `[media]`
   * background context note so the agent stays aware of the surface, and return a short JSON result
   * string for the model. Never throws — malformed args resolve to a `{ success: false, error }`
   * payload the model can narrate. Works with or without a bound surface (it mutates the state engine,
   * which the surface observes).
   */
  public ApplyAgentTool(toolName: string, argsJson: string): string {
    let args: Record<string, ToolArgValue> = {};
    try {
      const parsed = argsJson ? (JSON.parse(argsJson) as unknown) : {};
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        args = parsed as Record<string, ToolArgValue>;
      }
    } catch {
      return this.fail(`Could not parse arguments for ${toolName}.`);
    }

    switch (toolName) {
      case MEDIA_TOOL_NAMES.ShowMedia:
        return this.applyShowMedia(args);
      case MEDIA_TOOL_NAMES.CloseMedia:
        return this.applyCloseMedia(args);
      case MEDIA_TOOL_NAMES.PlayMedia:
        return this.applyPlayMedia(args);
      case MEDIA_TOOL_NAMES.Highlight:
        return this.applyHighlight(args);
      case MEDIA_TOOL_NAMES.ClearAll:
        return this.applyClearAll();
      default:
        return this.fail(`Unknown Media tool "${toolName}".`);
    }
  }

  /** Adds a media item and makes it active. Source is a public `url` OR an MJStorage `fileId` (>=1 required). */
  private applyShowMedia(args: Record<string, ToolArgValue>): string {
    const mediaType = asString(args['mediaType']);
    const url = asString(args['url']);
    const fileId = asString(args['fileId']);
    const displayName = asString(args['displayName']);
    if (!mediaType || !VALID_MEDIA_TYPES.includes(mediaType as MediaItemType)) {
      return this.fail('Media_ShowMedia requires a "mediaType" of image | video | audio | pdf | web.');
    }
    if (!url && !fileId) {
      return this.fail('Media_ShowMedia requires a source — provide a "url" (external/public) OR a "fileId" (an MJ: Files id).');
    }
    if (!displayName) {
      return this.fail('Media_ShowMedia requires a "displayName".');
    }
    const item = this.State.AddItem({
      Type: mediaType as MediaItemType,
      Url: url,
      FileID: fileId,
      DisplayName: displayName,
      Caption: asString(args['caption']),
    });
    this.note(`now showing ${mediaType} "${displayName}"`);
    return JSON.stringify({ success: true, id: item.Id, active: true });
  }

  /** Closes a media item. */
  private applyCloseMedia(args: Record<string, ToolArgValue>): string {
    const id = asString(args['id']);
    if (!id) {
      return this.fail('Media_CloseMedia requires an "id".');
    }
    const removed = this.State.RemoveItem(id);
    if (!removed) {
      return this.fail(`No media item with id "${id}".`);
    }
    this.note(`closed media item "${id}"`);
    return JSON.stringify({ success: true, id });
  }

  /** Activates + requests playback of a media item. */
  private applyPlayMedia(args: Record<string, ToolArgValue>): string {
    const id = asString(args['id']);
    if (!id) {
      return this.fail('Media_PlayMedia requires an "id".');
    }
    const ok = this.State.RequestPlay(id);
    if (!ok) {
      return this.fail(`No media item with id "${id}".`);
    }
    this.note(`playing media item "${id}"`);
    return JSON.stringify({ success: true, id });
  }

  /** Draws (or, with absent dims, clears) a fractional highlight on a media item. */
  private applyHighlight(args: Record<string, ToolArgValue>): string {
    const id = asString(args['id']);
    if (!id) {
      return this.fail('Media_Highlight requires an "id".');
    }
    const x = asNumber(args['x']);
    const y = asNumber(args['y']);
    const w = asNumber(args['w']);
    const h = asNumber(args['h']);
    if (x === undefined || y === undefined || w === undefined || h === undefined) {
      return this.fail('Media_Highlight requires numeric fractional x, y, w, h (0..1).');
    }
    const highlight: MediaHighlight = { X: x, Y: y, W: w, H: h, Label: asString(args['label']) };
    const ok = this.State.Highlight(id, highlight);
    if (!ok) {
      return this.fail(`No media item with id "${id}".`);
    }
    this.note(`highlighted a region of media item "${id}"`);
    return JSON.stringify({ success: true, id });
  }

  /** Clears all media. */
  private applyClearAll(): string {
    this.State.Clear();
    this.note('cleared all media');
    return JSON.stringify({ success: true });
  }

  /** The Media channel's serialized state of record (persisted under {@link ChannelName}). */
  public override SerializeState(): string | null {
    return this.State.ToJSON();
  }

  /**
   * Rehydrates a prior session's saved media into THIS session's state engine (in place — the
   * {@link State} instance and its subscriptions are preserved). Tolerant: malformed JSON returns
   * `false` and the surface stays empty.
   */
  public override RestoreState(stateJson: string): boolean {
    return this.State.LoadFromJSON(stateJson);
  }

  public override Dispose(): void {
    this.stateChangedSub?.unsubscribe();
    this.stateChangedSub = null;
    this.surface = null;
    super.Dispose();
  }

  /** Builds a model-readable failure payload (never thrown — returned to the model). */
  private fail(error: string): string {
    return JSON.stringify({ success: false, error });
  }

  /**
   * Pushes a background context note so the agent stays aware of the surface state. Framed as
   * background (like the whiteboard's scene-delta notes) so the model doesn't narrate every change.
   */
  private note(summary: string): void {
    this.Context?.SendContextNote(
      `[media] ${summary} (background context — do NOT narrate routine changes; mention only if relevant).`,
    );
  }
}

/**
 * Tree-shaking prevention: the Media channel is resolved dynamically through the ClassFactory (by the
 * registry row's `ClientPluginClass` key), so this static call keeps its `@RegisterClass` side effect
 * from being eliminated by the bundler. Called alongside `LoadRealtimeWhiteboardChannel()`.
 */
export function LoadRealtimeMediaChannel(): void {
  // intentional no-op — the import side effect performs the registration
}
