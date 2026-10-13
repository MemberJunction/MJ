import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { VideoSourceState } from '@memberjunction/ai-realtime-client';
import { MJButtonDirective, MJSwitchComponent } from '@memberjunction/ng-ui-components';

/** Raised when the user switches one of the agent's video sources on or off. */
export interface RealtimePerceptionToggle {
  /** The source's id (from the arbiter). */
  SourceID: string;
  /** Whether the agent may see it from now on. */
  Enabled: boolean;
}

/**
 * The "agent can see" chip: a persistent, honest indicator in the realtime overlay of what the agent is
 * looking at, with a switch per source to stop it.
 *
 * Shown whenever the session has a video source (a whiteboard, a remote browser, a shared screen), so a
 * person is never unsure whether the agent can see their screen. The trigger summarizes ("Agent can see:
 * Whiteboard"); opening it lists each source with a switch. Turning a source off removes it from what the
 * agent receives and tells the agent (the runtime owns both, and remembers the choice per channel).
 *
 * The agent may see fewer sources than are on (Gemini sees one). Then the trigger names the one it sees ("Agent
 * sees: Camera"), and the panel lets the user pick another ({@link SourcePicked}) and, once they have, let the
 * call choose again.
 *
 * Purely presentational: it renders the sources it is given and raises {@link SourceToggled}; it never
 * touches the session. Every control has an accessible name; the open panel closes on Escape.
 *
 * @example
 * ```html
 * <mj-realtime-perception-chip [Sources]="VideoSources" (SourceToggled)="OnToggle($event)">
 * </mj-realtime-perception-chip>
 * ```
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-perception-chip',
  imports: [FormsModule, MJButtonDirective, MJSwitchComponent],
  templateUrl: './realtime-perception-chip.component.html',
  styleUrl: './realtime-perception-chip.component.css'
})
export class RealtimePerceptionChipComponent {
  /** The video sources the agent can or could see. The chip is hidden while this is empty. */
  @Input() Sources: readonly VideoSourceState[] = [];

  /** Raised when the user switches a source on or off. */
  @Output() SourceToggled = new EventEmitter<RealtimePerceptionToggle>();

  /** Raised when the user picks the source the agent sees (its id), or lets the call choose again (`null`). */
  @Output() SourcePicked = new EventEmitter<string | null>();

  /** Whether the per-source panel is open. */
  public Expanded = false;

  /** The sources the agent may currently see (switched on). */
  public get EnabledSources(): readonly VideoSourceState[] {
    return this.Sources.filter((s) => s.Enabled);
  }

  /** The one-line summary on the trigger: with more sources on than the agent sees, the ones it sees. */
  public get Summary(): string {
    const enabled = this.EnabledSources;
    if (enabled.length === 0) {
      return 'Agent view off';
    }
    if (enabled.length === 1) {
      return `Agent can see: ${enabled[0].Label}`;
    }
    const seen = enabled.filter((s) => s.Active);
    if (seen.length === 0 || seen.length === enabled.length) {
      return `Agent can see ${enabled.length} sources`;
    }
    return seen.length === 1 ? `Agent sees: ${seen[0].Label}` : `Agent sees ${seen.length} of ${enabled.length} sources`;
  }

  /** Whether the user may pick a source: some source that is on is not one the agent sees. */
  public get CanPick(): boolean {
    return this.EnabledSources.some((s) => !s.Active);
  }

  /** Whether the user has picked the source the agent sees, so the call can be let choose again. */
  public get HasPick(): boolean {
    return this.Sources.some((s) => s.Picked);
  }

  /** The trigger's accessible name: the summary plus what activating it does. */
  public get TriggerLabel(): string {
    return `${this.Summary}. ${this.Expanded ? 'Hide' : 'Show'} what the agent can see.`;
  }

  /** Opens or closes the panel. */
  public TogglePanel(): void {
    this.Expanded = !this.Expanded;
  }

  /** Closes the panel on Escape, wherever focus is inside the chip. */
  @HostListener('keydown.escape')
  public OnEscape(): void {
    this.Expanded = false;
  }

  /** A switch changed: raise the event for the host to apply. */
  public OnSwitch(source: VideoSourceState, enabled: boolean): void {
    if (enabled !== source.Enabled) {
      this.SourceToggled.emit({ SourceID: source.SourceID, Enabled: enabled });
    }
  }

  /** The user picks the source the agent sees, or lets the call choose again (`null`). */
  public OnPick(source: VideoSourceState | null): void {
    this.SourcePicked.emit(source?.SourceID ?? null);
  }

  /** The row's status text: whether the agent is looking at it right now, and whether by the user's pick. */
  public StatusText(source: VideoSourceState): string {
    if (!source.Enabled) {
      return 'Off';
    }
    if (!source.Active) {
      return 'Available';
    }
    return source.Picked ? 'Viewing now, your pick' : 'Viewing now';
  }

  /** The pick button's accessible name. */
  public PickLabel(source: VideoSourceState): string {
    return `Show the agent ${source.Label}`;
  }

  /** The switch's accessible name. */
  public SwitchLabel(source: VideoSourceState): string {
    return `Let the agent see ${source.Label}`;
  }

  /** track fn for the source list. */
  public TrackSource(_index: number, source: VideoSourceState): string {
    return source.SourceID;
  }
}
