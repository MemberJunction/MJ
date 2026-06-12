import type { Type } from '@angular/core';
import { Subscription } from 'rxjs';
import { RegisterClass } from '@memberjunction/global';
import { RealtimeToolDefinition } from '@memberjunction/ai';
import { BaseRealtimeChannelClient } from '../channels/base-realtime-channel-client';
import {
  ApplyWhiteboardAgentTool, RealtimeWhiteboardHostComponent, WHITEBOARD_TOOL_DEFINITIONS,
  WHITEBOARD_TOOL_PREFIX, WhiteboardState, WhiteboardWidgetSubmitEvent
} from '@memberjunction/ng-whiteboard';

/**
 * The LIVE WHITEBOARD as a pluggable interactive channel — the canonical
 * {@link BaseRealtimeChannelClient} implementation, resolved from the `MJ: AI Agent
 * Channels` registry row whose `ClientPluginClass` is `'RealtimeWhiteboardChannel'`.
 *
 * One instance per session (created via ClassFactory at session start). It owns the
 * board's {@link WhiteboardState} engine and contributes the channel's full contract:
 *
 *  - **Action**: the `Whiteboard_*` client-executed tool set
 *    ({@link WHITEBOARD_TOOL_DEFINITIONS}); {@link ApplyAgentTool} prefers the BOUND host
 *    component (board mutation + violet pop-in / toast / presence-cursor garnish) and
 *    falls back to the pure {@link ApplyWhiteboardAgentTool} engine call when no surface
 *    is bound (e.g. the surface panel is collapsed) — the channel keeps working, just
 *    without the garnish.
 *  - **Perception**: {@link BindSurface} subscribes the host's coalesced (750 ms)
 *    `SceneDelta` stream and pipes each delta into the live model's context as a
 *    `[whiteboard]` background note; the agent-undo toast click flows the same way.
 *  - **Surface**: {@link RealtimeWhiteboardHostComponent}, created dynamically by the
 *    overlay's channel tab; the host's Focus toggle rides `Context.SetFocusMode` so the
 *    shell can collapse/restore the main call column.
 *  - **State of record**: every board mutation (user edits AND agent tool calls) requests
 *    a save of {@link WhiteboardState.ToJSON} under channel name `'Whiteboard'` — the
 *    host debounces and flushes at teardown.
 *
 * A PRIOR session's persisted board is restored through {@link RestoreState} (invoked by
 * the session host after Initialize, before any surface binding): the saved JSON is
 * rehydrated IN PLACE into the same {@link WhiteboardState} instance, so the save
 * subscription and any later surface binding keep pointing at one engine. Malformed or
 * incompatible payloads are tolerated — the board simply starts fresh.
 */
@RegisterClass(BaseRealtimeChannelClient, 'RealtimeWhiteboardChannel')
export class RealtimeWhiteboardChannel extends BaseRealtimeChannelClient<RealtimeWhiteboardHostComponent> {
  /** The board's state of record — created fresh with the plugin (one per session). */
  public readonly State = new WhiteboardState();

  /** The live bound surface, when the channel tab's pane is instantiated. */
  private host: RealtimeWhiteboardHostComponent | null = null;
  /** Output subscriptions on the bound surface (SceneDelta / AgentUndo / FocusModeChange). */
  private surfaceSubs: Subscription[] = [];
  /** Board-mutation subscription driving the debounced state-of-record save. */
  private stateChangedSub: Subscription | null = null;

  public get ChannelName(): string {
    return 'Whiteboard';
  }

  public get ToolNamePrefix(): string {
    return WHITEBOARD_TOOL_PREFIX;
  }

  public get TabTitle(): string {
    return 'Whiteboard';
  }

  public get TabIcon(): string {
    return 'fa-solid fa-chalkboard';
  }

  public GetToolDefinitions(): RealtimeToolDefinition[] {
    return WHITEBOARD_TOOL_DEFINITIONS;
  }

  public GetSurfaceComponent(): Type<RealtimeWhiteboardHostComponent> {
    return RealtimeWhiteboardHostComponent;
  }

  /** Persist the board (host-debounced) on EVERY board mutation — user edits AND agent tools. */
  protected override OnInitialize(): void {
    this.stateChangedSub = this.State.Changed$.subscribe(() => {
      this.Context?.RequestSave(this.State.ToJSON());
    });
  }

  /**
   * Wires the dynamically-created board host: inputs (shared state engine + agent name)
   * are set BEFORE the component's first change detection, and the perception/garnish
   * outputs are subscribed back into the host context — the overlay never sees any of it.
   */
  public BindSurface(instance: RealtimeWhiteboardHostComponent): void {
    this.releaseSurface();
    this.host = instance;
    instance.State = this.State;
    instance.AgentName = this.Context?.AgentName ?? 'Agent';
    this.surfaceSubs.push(
      // The board's coalesced scene delta — the perception feed the agent "sees".
      instance.SceneDelta.subscribe((deltaJson: string) => {
        // Background PERCEPTION, not conversation: the model sees every user edit without
        // being told, but must not narrate minor changes — only react when something is
        // significant (or when asked). The etiquette rides in the note itself so any
        // realtime model gets it regardless of system-prompt sync state.
        this.Context?.SendContextNote(
          '[whiteboard] board update (background context — do NOT comment on minor edits; ' +
          'only mention it if the change is significant to the discussion): ' + deltaJson);
      }),
      // The user clicked Undo on the agent-action toast (the undo already applied locally).
      instance.AgentUndo.subscribe(() => {
        this.Context?.SendContextNote('[whiteboard] user undid your last change');
      }),
      // A sandboxed HTML widget submitted user input (MJWhiteboard.submit) — already
      // validated, size-capped and not canceled (the host's cancelable WidgetSubmitting
      // event ran first). Surface it to the agent so it can react to quiz answers /
      // micro-form input it asked for.
      instance.WidgetSubmitted.subscribe((submit: WhiteboardWidgetSubmitEvent) => {
        this.Context?.SendContextNote(
          `[whiteboard] the user submitted input in widget "${submit.Title || submit.ItemID}": ${submit.DataJson}`);
      }),
      // The board's Focus toggle — ask the shell to collapse/restore the main call column.
      instance.FocusModeChange.subscribe((focused: boolean) => {
        this.Context?.SetFocusMode(focused);
      }),
      // "Save to artifacts": snapshot the board as a first-class versioned artifact.
      instance.SaveToArtifactsRequested.subscribe(() => {
        void this.saveBoardAsArtifact();
      })
    );
  }

  public override UnbindSurface(): void {
    this.releaseSurface();
  }

  /**
   * Persists the current board as a `MJ: Artifacts` snapshot via the host context
   * (best-effort; the host logs failures). On success the agent is told via a context
   * note so it can reference the saved artifact naturally.
   */
  private async saveBoardAsArtifact(): Promise<void> {
    const ctx = this.Context;
    if (!ctx) {
      return;
    }
    const now = new Date();
    const name = `Whiteboard — ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const artifactId = await ctx.SaveAsArtifact(name, this.State.ToJSON());
    if (artifactId) {
      ctx.SendContextNote(`[whiteboard] the user saved the current board as the artifact "${name}"`);
    }
  }

  /**
   * Executes one `Whiteboard_*` tool call LOCALLY. Prefers the live bound host (board
   * mutation + UI garnish); falls back to the pure engine function when no surface is
   * bound so the channel keeps working with the pane collapsed.
   */
  public ApplyAgentTool(toolName: string, argsJson: string): string {
    if (this.host) {
      return this.host.ApplyAgentTool(toolName, argsJson);
    }
    return ApplyWhiteboardAgentTool(this.State, toolName, argsJson);
  }

  /** The board's serialized state of record (persisted under {@link ChannelName}). */
  public override SerializeState(): string | null {
    return this.State.ToJSON();
  }

  /**
   * Rehydrates a prior session's saved board into THIS session's state engine (in place —
   * the {@link State} instance and its subscriptions are preserved). Returns `true` on
   * success; malformed / incompatible JSON returns `false` and the board stays fresh
   * (never throws — {@link WhiteboardState.LoadFromJSON} is tolerant by contract).
   */
  public override RestoreState(stateJson: string): boolean {
    return this.State.LoadFromJSON(stateJson);
  }

  /**
   * Exit focus mode THROUGH the bound host (its own Focus button state stays in sync; it
   * re-emits `FocusModeChange(false)` → `Context.SetFocusMode(false)`). When no surface is
   * bound the overlay's defensive flag clear covers it.
   */
  public override RequestFocusExit(): void {
    if (this.host?.FocusMode) {
      this.host.ToggleFocus();
    }
  }

  public override Dispose(): void {
    this.stateChangedSub?.unsubscribe();
    this.stateChangedSub = null;
    super.Dispose(); // releases the surface binding + context
  }

  /** Unsubscribes surface outputs and drops the host reference. */
  private releaseSurface(): void {
    for (const sub of this.surfaceSubs) {
      sub.unsubscribe();
    }
    this.surfaceSubs = [];
    this.host = null;
  }
}

/**
 * Tree-shaking prevention: the whiteboard channel is resolved dynamically through the
 * ClassFactory (by the registry row's `ClientPluginClass` key), so this static call is
 * what keeps its `@RegisterClass` side effect from being eliminated by the bundler.
 * Called by `RealtimeSessionService` alongside the realtime-client driver Load calls.
 */
export function LoadRealtimeWhiteboardChannel(): void {
  // intentional no-op — the import side effect performs the registration
}
