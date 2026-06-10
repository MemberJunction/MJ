import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * The view-model for one delegation card shown in the live thread. Built by
 * {@link RealtimeSessionThreadComponent} from the stream of `VoiceDelegationProgress`
 * updates (correlated by `CallID`) and the assistant's narration.
 */
export interface RealtimeDelegationCardVM {
  /** The `invoke-target-agent` call this card represents. */
  CallID: string;
  /** Display name of the delegated agent (e.g. "Sage"). */
  AgentName: string;
  /** Latest human-readable progress message from the stream. */
  LatestMessage: string;
  /** The delegation phase (`prompt_execution` | `action_execution` | …). */
  LatestStep: string;
  /** Optional completion percentage (0–100) when the server supplies it. */
  Percentage?: number;
  /** `true` once the card transitions from "working" to "done · via <agent>". */
  Done: boolean;
  /** Short run identifier (e.g. "#a3f1") if known; shown in the provenance badge. */
  RunRef?: string;
}

/**
 * Renders a single delegation as it progresses, faithful to delegation-flow.html:
 *  - **Working** state: a "🔧 <agent> is working…" card showing the latest step/message
 *    (the `.work-card` look — sage-tinted, with a spinner step).
 *  - **Done** state: a completion card with a clear "via <agent>" provenance badge,
 *    matching the mockup's `via Sage · run #…` connector.
 *
 * The voice stream currently only emits PROGRESS (`VoiceDelegationProgress`), not the
 * final structured result object — so the "done" state shows a provenance-stamped
 * completion ("<agent> finished · via <agent>") rather than the rich weather-grid
 * result card from the mockup. When the service later surfaces a structured result,
 * pass it via {@link Result} and the result block renders it. (See REPORT.)
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-delegation-card',
  imports: [CommonModule],
  templateUrl: './realtime-delegation-card.component.html',
  styleUrl: './realtime-delegation-card.component.css'
})
export class RealtimeDelegationCardComponent {
  /** The delegation card view-model to render. */
  @Input({ required: true }) Card!: RealtimeDelegationCardVM;

  /**
   * Optional structured result text surfaced on completion. The voice stream does not
   * yet provide this (progress-only), so it's usually null and the card falls back to a
   * generic provenance-stamped completion line.
   */
  @Input() Result: string | null = null;

  /** Friendly label for the current delegation step. */
  public StepLabel(step: string): string {
    switch (step) {
      case 'prompt_execution': return 'Analyzing request';
      case 'action_execution': return 'Running action';
      case 'subagent_execution': return 'Delegating to sub-agent';
      case 'decision_processing': return 'Deciding next step';
      default: return step ? step.replace(/_/g, ' ') : 'Working';
    }
  }
}
