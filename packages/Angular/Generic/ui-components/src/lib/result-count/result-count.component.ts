import { Component, Input } from '@angular/core';

/**
 * mj-result-count — Canonical pill that renders "X label" or "X of Y label"
 * (e.g. "12 agents", "8 of 24 prompts"). Replaces per-page `.item-count` rules.
 *
 * Pass `Total` only when the displayed count is the *filtered* result of a
 * larger set; otherwise omit it to render just "Count Label".
 *
 * Example:
 * ```html
 * <mj-result-count [Count]="filteredAgents.length" Label="agents"></mj-result-count>
 * <mj-result-count
 *   [Count]="filteredCount"
 *   [Total]="totalCount"
 *   Label="configurations">
 * </mj-result-count>
 * ```
 */
@Component({
  selector: 'mj-result-count',
  standalone: true,
  template: `
    <span class="mj-result-count">
      @if (Total != null) {
        {{ Count }} of {{ Total }} {{ Label }}
      } @else {
        {{ Count }} {{ Label }}
      }
    </span>
  `,
  styles: [`
    :host {
      display: inline-flex;
    }

    .mj-result-count {
      display: inline-flex;
      align-items: center;
      padding: 6px 12px;
      background: var(--mj-bg-surface-card);
      border: 1px solid var(--mj-border-default);
      border-radius: 16px;
      color: var(--mj-text-muted);
      font-size: 13px;
      font-weight: 500;
      line-height: 1.2;
      white-space: nowrap;
    }
  `]
})
export class MJResultCountComponent {
  @Input() Count: number = 0;
  @Input() Total: number | null = null;
  @Input() Label: string = '';
}
