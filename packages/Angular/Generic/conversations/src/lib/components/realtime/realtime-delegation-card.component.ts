import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RealtimeDelegationCardVM, FriendlyStepLabel } from './realtime-session-state';

/**
 * Renders a single delegation in the live session thread:
 *  - **Working**: a compact card — agent avatar, "<agent> is working…", the CURRENT
 *    friendly step label, the latest raw message indented + muted beneath it, and a
 *    thin progress bar (determinate when the server supplies a percentage,
 *    indeterminate shimmer otherwise).
 *  - **Done**: COLLAPSED to a single-line chip — `✓ <agent> · <one-line result preview>
 *    · via <agent>` — expandable inline (click / chevron) to the full result text.
 *    Failures render the `✗` variant.
 *
 * Provenance is a small `via <agent>` badge + a shield icon whose `title` tooltip
 * carries the full provenance sentence (no repeated sentence under every card).
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-delegation-card',
  imports: [CommonModule],
  templateUrl: './realtime-delegation-card.component.html',
  styleUrl: './realtime-delegation-card.component.css'
})
export class RealtimeDelegationCardComponent {
  /** Maximum characters of the result shown in the collapsed done chip. */
  private static readonly PreviewMaxChars = 120;

  /** The delegation card view-model to render (immutable — replaced on every update). */
  @Input({ required: true }) Card!: RealtimeDelegationCardVM;

  /** Whether the done chip is expanded inline to show the full result text. */
  public Expanded = false;

  /** Friendly label for the current delegation step (raw message as fallback). */
  public get StepLabel(): string {
    return FriendlyStepLabel(this.Card.LatestStep, this.Card.LatestMessage);
  }

  /**
   * Whether to render the latest raw message as the indented detail line. Hidden when
   * it would just repeat the step label (the unknown-step fallback maps label = message).
   */
  public get ShowDetailLine(): boolean {
    return !!this.Card.LatestMessage && this.Card.LatestMessage !== this.StepLabel;
  }

  /** Full result text (falls back to the last progress message / a generic line). */
  public get ResultText(): string {
    return this.Card.Result
      || this.Card.LatestMessage
      || `${this.Card.AgentName} completed the delegated work.`;
  }

  /** One-line, ~120-char preview of the result for the collapsed chip. */
  public get ResultPreview(): string {
    const oneLine = this.ResultText.replace(/\s+/g, ' ').trim();
    const max = RealtimeDelegationCardComponent.PreviewMaxChars;
    return oneLine.length > max ? `${oneLine.slice(0, max).trimEnd()}…` : oneLine;
  }

  /** Tooltip text for the provenance shield icon. */
  public get ProvenanceTitle(): string {
    const run = this.Card.RunRef ? ` (run ${this.Card.RunRef})` : '';
    return `Result produced by ${this.Card.AgentName}'s own agent run${run} — not invented by the voice co-agent.`;
  }

  /** Toggles the done chip's inline expansion. */
  public ToggleExpanded(): void {
    this.Expanded = !this.Expanded;
  }
}
