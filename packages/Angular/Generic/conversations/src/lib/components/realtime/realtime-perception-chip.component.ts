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

  /** Whether the per-source panel is open. */
  public Expanded = false;

  /** The sources the agent may currently see (switched on). */
  public get EnabledSources(): readonly VideoSourceState[] {
    return this.Sources.filter((s) => s.Enabled);
  }

  /** The one-line summary on the trigger. */
  public get Summary(): string {
    const enabled = this.EnabledSources;
    if (enabled.length === 0) {
      return 'Agent view off';
    }
    return enabled.length === 1 ? `Agent can see: ${enabled[0].Label}` : `Agent can see ${enabled.length} sources`;
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

  /** The row's status text: whether the agent is looking at it right now. */
  public StatusText(source: VideoSourceState): string {
    if (!source.Enabled) {
      return 'Off';
    }
    return source.Active ? 'Viewing now' : 'Available';
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
