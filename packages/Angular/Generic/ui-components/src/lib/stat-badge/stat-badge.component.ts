import { Component, HostBinding, Input } from '@angular/core';

/** Visual variant for `<mj-stat-badge>`. */
export type MJStatBadgeVariant =
  | 'default'    // neutral surface-card pill
  | 'success'    // green-tinted (e.g. "12 succeeded")
  | 'error'      // red-tinted (e.g. "3 failed")
  | 'warning'    // amber-tinted (e.g. "5 expiring")
  | 'running'    // amber-tinted with spinner-friendly affordance
  | 'info';      // brand-tinted

/**
 * mj-stat-badge — Small read-only pill for the `[meta]` slot of
 * `<mj-page-header>`. Used to surface counts, status pills, and other
 * informational chips next to the page title.
 *
 * Replaces the per-section `.{section}-stat-badge` / `.X-header-meta-badge`
 * CSS that pages were duplicating after the chrome migration.
 *
 * Examples:
 * ```html
 * <mj-stat-badge [Count]="42" Label="integrations" />
 *
 * <mj-stat-badge [Count]="failedRuns" Label="failed" variant="error" />
 *
 * <mj-stat-badge Icon="fa-solid fa-spinner fa-spin" Label="running" variant="running" />
 *
 * <mj-stat-badge variant="success">All clear</mj-stat-badge>   <!-- arbitrary projected content -->
 * ```
 */
@Component({
  selector: 'mj-stat-badge',
  standalone: true,
  template: `
    @if (Icon) {
      <i [class]="Icon" aria-hidden="true"></i>
    }
    @if (Count != null) {
      <strong>{{ Count }}</strong>
    }
    @if (Label) {
      <span class="mj-stat-badge-label">{{ Label }}</span>
    }
    <ng-content></ng-content>
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: var(--mj-bg-surface-card);
      border: 1px solid var(--mj-border-default);
      border-radius: 999px;
      font-size: 12px;
      color: var(--mj-text-secondary);
      white-space: nowrap;
      line-height: 1.4;
    }

    :host strong {
      color: var(--mj-text-primary);
      font-weight: 600;
    }

    /* ── Variants ─────────────────────────────────────────────── */

    :host(.mj-stat-badge--success) {
      background: color-mix(in srgb, var(--mj-status-success) 10%, var(--mj-bg-surface));
      border-color: color-mix(in srgb, var(--mj-status-success) 30%, var(--mj-border-default));
      color: var(--mj-status-success);
    }
    :host(.mj-stat-badge--success) strong { color: inherit; }

    :host(.mj-stat-badge--error) {
      background: color-mix(in srgb, var(--mj-status-error) 10%, var(--mj-bg-surface));
      border-color: color-mix(in srgb, var(--mj-status-error) 30%, var(--mj-border-default));
      color: var(--mj-status-error);
    }
    :host(.mj-stat-badge--error) strong { color: inherit; }

    :host(.mj-stat-badge--warning),
    :host(.mj-stat-badge--running) {
      background: color-mix(in srgb, var(--mj-status-warning) 10%, var(--mj-bg-surface));
      border-color: color-mix(in srgb, var(--mj-status-warning) 30%, var(--mj-border-default));
      color: var(--mj-status-warning);
    }
    :host(.mj-stat-badge--warning) strong,
    :host(.mj-stat-badge--running) strong { color: inherit; }

    :host(.mj-stat-badge--info) {
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
      border-color: color-mix(in srgb, var(--mj-brand-primary) 30%, var(--mj-border-default));
      color: var(--mj-brand-primary);
    }
    :host(.mj-stat-badge--info) strong { color: inherit; }
  `]
})
export class MJStatBadgeComponent {
  /** Numeric or text value rendered as `<strong>`. Omit if using `Label` only. */
  @Input() Count: number | string | null = null;

  /** Descriptive text after the count (e.g. "integrations", "failed"). */
  @Input() Label: string = '';

  /** Optional Font Awesome icon prefixed before the count/label. */
  @Input() Icon: string = '';

  /** Color treatment. Defaults to neutral surface-card. */
  @Input() Variant: MJStatBadgeVariant = 'default';

  @HostBinding('class.mj-stat-badge--success')
  get IsSuccess(): boolean { return this.Variant === 'success'; }

  @HostBinding('class.mj-stat-badge--error')
  get IsError(): boolean { return this.Variant === 'error'; }

  @HostBinding('class.mj-stat-badge--warning')
  get IsWarning(): boolean { return this.Variant === 'warning'; }

  @HostBinding('class.mj-stat-badge--running')
  get IsRunning(): boolean { return this.Variant === 'running'; }

  @HostBinding('class.mj-stat-badge--info')
  get IsInfo(): boolean { return this.Variant === 'info'; }
}
