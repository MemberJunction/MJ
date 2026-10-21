import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MJEmptyStateComponent, MJProgressBarComponent, MJStatBadgeComponent } from '@memberjunction/ng-ui-components';
import type { LiveKitTurnStateModel } from '../models';
import {
  BuildTurnEventRows,
  BuildTurnSeats,
  LIVEKIT_TURN_FEED_DEFAULT_ROWS,
  SummarizeFloor,
  SummarizeLoopCap,
  type LiveKitFloorSummary,
  type LiveKitLoopCapSummary,
  type LiveKitTurnEventRow,
  type LiveKitTurnSeat,
} from '../livekit-turn-state-logic';

/**
 * `mj-livekit-turn-state` — a live view of who may speak in a room that holds several agents: who has the
 * floor, whether a person is talking (people always win), any hand-off in flight, how close the agents are to
 * the agent-to-agent loop cap, and a feed of the latest floor / backchannel / yield events. A presentational
 * widget: the host feeds {@link State} (it polls or subscribes however it likes) and this renders it.
 */
@Component({
  selector: 'mj-livekit-turn-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MJProgressBarComponent, MJStatBadgeComponent, MJEmptyStateComponent],
  template: `
    <section class="lk-turn" aria-label="Turn-taking">
      @if (!HasState) {
        <mj-empty-state Size="compact" Icon="fa-solid fa-comments" Title="No agents in this room yet" Message="Seat two or more agents to see them take turns."></mj-empty-state>
      } @else {
        <div class="lk-turn__floor lk-turn__floor--{{ Floor.Kind }}" role="status" aria-live="polite">
          <i class="lk-turn__floor-icon fa-solid" [class]="FloorIcon" aria-hidden="true"></i>
          <span class="lk-turn__floor-label">{{ Floor.Label }}</span>
        </div>

        <div class="lk-turn__seats">
          @for (seat of Seats; track seat.AgentSessionId) {
            <div class="lk-turn__seat" [class.lk-turn__seat--floor]="seat.HasFloor" [class.lk-turn__seat--reserved]="seat.HasReservation">
              <span class="lk-turn__seat-name">
                <i class="fa-solid" [class.fa-microphone-lines]="seat.HasFloor" [class.fa-robot]="!seat.HasFloor" aria-hidden="true"></i>
                {{ seat.Name }}
              </span>
              <span class="lk-turn__chips">
                <mj-stat-badge [Label]="seat.ModeLabel"></mj-stat-badge>
                <mj-stat-badge [Label]="seat.AddressingLabel" [Variant]="seat.AddressingLabel === 'Model-side' ? 'info' : 'default'"></mj-stat-badge>
                @if (seat.FullDuplex) {
                  <mj-stat-badge Label="Full duplex" Variant="success"></mj-stat-badge>
                }
                @if (seat.HasReservation) {
                  <mj-stat-badge Label="Next up" Variant="warning"></mj-stat-badge>
                }
              </span>
            </div>
          }
        </div>

        <div class="lk-turn__cap lk-turn__cap--{{ Cap.Level }}">
          <div class="lk-turn__cap-head">
            <span>{{ Cap.Label }}</span>
            <span class="lk-turn__backchannels" title="Short acknowledgements that did not take the floor">
              <i class="fa-solid fa-comment-dots" aria-hidden="true"></i> {{ BackchannelCount }}
            </span>
          </div>
          <mj-progress-bar [Value]="Cap.Percent"></mj-progress-bar>
        </div>

        <ol class="lk-turn__feed" aria-label="Recent turn-taking events">
          @for (row of Rows; track row.Seq) {
            <li class="lk-turn__event lk-turn__event--{{ row.Tone }}">
              <i [class]="row.Icon" aria-hidden="true"></i>
              <span class="lk-turn__event-text">{{ row.Text }}</span>
              <time class="lk-turn__event-time">{{ row.Time }}</time>
            </li>
          } @empty {
            <li class="lk-turn__event lk-turn__event--neutral">
              <span class="lk-turn__event-text">Nothing has happened yet.</span>
            </li>
          }
        </ol>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .lk-turn {
        display: flex;
        flex-direction: column;
        gap: 10px;
        color: var(--mj-text-primary);
      }
      .lk-turn__floor {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        border-radius: 8px;
        font-size: 0.875rem;
        font-weight: 600;
        background: var(--mj-bg-surface-card);
        border: 1px solid var(--mj-border-default);
      }
      .lk-turn__floor--agent {
        color: var(--mj-text-inverse);
        background: var(--mj-brand-primary);
        border-color: var(--mj-brand-primary);
      }
      .lk-turn__floor--human {
        color: var(--mj-status-warning-text);
        background: color-mix(in srgb, var(--mj-status-warning) 14%, var(--mj-bg-surface));
        border-color: var(--mj-status-warning);
      }
      .lk-turn__floor--capped {
        color: var(--mj-status-error-text);
        background: color-mix(in srgb, var(--mj-status-error) 10%, var(--mj-bg-surface));
        border-color: var(--mj-status-error);
      }
      .lk-turn__floor--reserved {
        border-color: var(--mj-status-info);
      }
      .lk-turn__seats {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .lk-turn__seat {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 6px 8px;
        border-radius: 8px;
        border: 1px solid var(--mj-border-subtle);
      }
      .lk-turn__seat--floor {
        border-color: var(--mj-brand-primary);
        background: color-mix(in srgb, var(--mj-brand-primary) 8%, var(--mj-bg-surface));
      }
      .lk-turn__seat--reserved {
        border-style: dashed;
        border-color: var(--mj-status-info);
      }
      .lk-turn__seat-name {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8125rem;
        font-weight: 600;
      }
      .lk-turn__seat-name i {
        color: var(--mj-brand-primary);
      }
      .lk-turn__chips {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }
      .lk-turn__cap {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 0.75rem;
        color: var(--mj-text-secondary);
      }
      .lk-turn__cap--warn {
        color: var(--mj-status-warning-text);
      }
      .lk-turn__cap--capped {
        color: var(--mj-status-error-text);
      }
      .lk-turn__cap-head {
        display: flex;
        justify-content: space-between;
        gap: 8px;
      }
      .lk-turn__backchannels {
        color: var(--mj-text-muted);
      }
      .lk-turn__feed {
        list-style: none;
        margin: 0;
        padding: 0;
        max-height: 180px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .lk-turn__event {
        display: grid;
        grid-template-columns: 16px 1fr auto;
        align-items: baseline;
        gap: 6px;
        font-size: 0.75rem;
        color: var(--mj-text-secondary);
      }
      .lk-turn__event--good i {
        color: var(--mj-status-success);
      }
      .lk-turn__event--warn i {
        color: var(--mj-status-warning);
      }
      .lk-turn__event--bad i {
        color: var(--mj-status-error);
      }
      .lk-turn__event-time {
        color: var(--mj-text-muted);
        font-variant-numeric: tabular-nums;
      }
    `,
  ],
})
export class LiveKitTurnStateComponent {
  /** The most events the feed shows. */
  @Input()
  public set MaxEvents(value: number) {
    this.maxEvents = value;
    this.rebuild();
  }
  public get MaxEvents(): number {
    return this.maxEvents;
  }
  private maxEvents = LIVEKIT_TURN_FEED_DEFAULT_ROWS;

  /** Whether a state has been supplied. */
  public HasState = false;
  /** The floor summary. */
  public Floor: LiveKitFloorSummary = { Kind: 'free', Label: '', AgentSessionId: null };
  /** The loop-cap summary. */
  public Cap: LiveKitLoopCapSummary = { Percent: 0, Label: '', Level: 'ok' };
  /** The agents seated in the room. */
  public Seats: LiveKitTurnSeat[] = [];
  /** The event feed, newest first. */
  public Rows: LiveKitTurnEventRow[] = [];
  /** How many backchannels the room has recorded. */
  public BackchannelCount = 0;

  /** The room's live turn-taking state. `null` shows the empty state. */
  @Input()
  public set State(value: LiveKitTurnStateModel | null) {
    this.state = value;
    this.rebuild();
  }
  public get State(): LiveKitTurnStateModel | null {
    return this.state;
  }
  private state: LiveKitTurnStateModel | null = null;

  /** The Font Awesome icon for the floor banner. */
  public get FloorIcon(): string {
    switch (this.Floor.Kind) {
      case 'human':
        return 'fa-user';
      case 'agent':
        return 'fa-microphone-lines';
      case 'capped':
        return 'fa-hourglass-half';
      case 'reserved':
        return 'fa-share';
      default:
        return 'fa-microphone-lines-slash';
    }
  }

  private rebuild(): void {
    const state = this.state;
    this.HasState = state !== null && state.Agents.length > 0;
    if (!state || !this.HasState) {
      this.Seats = [];
      this.Rows = [];
      this.BackchannelCount = 0;
      return;
    }
    this.Floor = SummarizeFloor(state);
    this.Cap = SummarizeLoopCap(state);
    this.Seats = BuildTurnSeats(state);
    this.Rows = BuildTurnEventRows(state, this.maxEvents);
    this.BackchannelCount = state.BackchannelCount;
  }
}
