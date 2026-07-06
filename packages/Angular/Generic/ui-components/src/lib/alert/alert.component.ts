import { booleanAttribute, Component, EventEmitter, HostBinding, Input, Output } from '@angular/core';

/**
 * Visual intent of an `<mj-alert>`. Drives the color treatment and the default
 * icon, so callers don't restate either for the common cases.
 *
 * - `info`    — neutral informational notice (default).
 * - `success` — a positive confirmation that stays on screen.
 * - `warning` — a non-blocking caution.
 * - `error`   — a failure / blocking problem.
 */
export type MJAlertVariant = 'info' | 'success' | 'warning' | 'error';

/** Density of an `<mj-alert>` — controls padding and font size. */
export type MJAlertSize = 'sm' | 'md';

const DEFAULT_ICONS: Record<MJAlertVariant, string> = {
  info: 'fa-solid fa-circle-info',
  success: 'fa-solid fa-circle-check',
  warning: 'fa-solid fa-triangle-exclamation',
  error: 'fa-solid fa-circle-exclamation',
};

/**
 * mj-alert — Canonical inline alert / banner. The persistent, in-flow message box
 * (info / success / warning / error) — NOT the transient corner toast (that's
 * `NotificationService` from `@memberjunction/ng-notifications`).
 *
 * Replaces the ~50 hand-rolled `.error-message` / `.alert` / `.warning-banner`
 * `<div>`s that pages each style themselves, e.g.:
 * ```html
 * <div class="error-message">
 *   <i class="fa-solid fa-circle-exclamation"></i> Couldn't save changes.
 * </div>
 * ```
 *
 * Usage:
 * ```html
 * <!-- Simplest -->
 * <mj-alert Variant="error" Message="Couldn't save changes." />
 *
 * <!-- Title + message + dismiss -->
 * <mj-alert Variant="warning" Title="Unsaved changes"
 *           Message="Leaving now will discard them." Dismissible
 *           (Dismissed)="onDismiss()" />
 *
 * <!-- Rich body + action buttons -->
 * <mj-alert Variant="info" Title="Read-only mode">
 *   You don't have edit permission for this record.
 *   <button mjButton variant="primary" actions (click)="requestAccess()">Request access</button>
 * </mj-alert>
 * ```
 *
 * Colors come from the `--mj-status-*` design tokens, so it's dark-mode-safe and
 * themeable. The host gets an ARIA live role (`alert` for error/warning, `status`
 * for info/success) so dynamically-shown alerts announce themselves.
 */
@Component({
  selector: 'mj-alert',
  standalone: true,
  template: `
    @if (!isDismissed) {
      @if (ResolvedIcon) {
        <i class="mj-alert__icon {{ ResolvedIcon }}" aria-hidden="true"></i>
      }
      <div class="mj-alert__content">
        @if (Title) {
          <div class="mj-alert__title">{{ Title }}</div>
        }
        @if (Message) {
          <div class="mj-alert__message">{{ Message }}</div>
        }
        <ng-content></ng-content>
      </div>
      <div class="mj-alert__actions">
        <ng-content select="[actions]"></ng-content>
      </div>
      @if (Dismissible) {
        <button type="button" class="mj-alert__dismiss" aria-label="Dismiss" (click)="Dismiss()">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      }
    }
  `,
  styles: [`
    :host {
      display: flex;
      align-items: flex-start;
      gap: var(--mj-space-3);
      padding: var(--mj-space-3) var(--mj-space-4);
      margin-bottom: var(--mj-space-4);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-md);
      font-size: var(--mj-text-sm);
      line-height: 1.45;
    }
    /* Alerts are flow content almost always followed by other content, so they
       carry a default bottom margin (like a <p>; cf. Bootstrap's .alert). When an
       alert is the only/last child of its container, drop the trailing gap. */
    :host(:last-child) { margin-bottom: 0; }
    :host(.mj-alert--dismissed) { display: none; }

    .mj-alert__icon {
      flex-shrink: 0;
      font-size: 1rem;
      margin-top: 0.1em;
    }
    .mj-alert__content { flex: 1; min-width: 0; }
    .mj-alert__title { font-weight: var(--mj-font-semibold); }
    .mj-alert__title + .mj-alert__message { margin-top: var(--mj-space-1); }
    .mj-alert__message { color: inherit; opacity: 0.9; }

    .mj-alert__actions {
      display: flex;
      align-items: center;
      gap: var(--mj-space-2);
      flex-shrink: 0;
    }
    .mj-alert__actions:empty { display: none; }

    .mj-alert__dismiss {
      flex-shrink: 0;
      border: none;
      background: transparent;
      color: inherit;
      opacity: 0.6;
      cursor: pointer;
      padding: 0;
      width: 20px; height: 20px;
      display: flex; align-items: center; justify-content: center;
      border-radius: var(--mj-radius-sm);
      transition: opacity var(--mj-transition-fast), background var(--mj-transition-fast);
    }
    .mj-alert__dismiss:hover { opacity: 1; background: color-mix(in srgb, currentColor 12%, transparent); }

    /* ── Density ───────────────────────────────────────────────── */
    :host(.mj-alert--sm) {
      padding: var(--mj-space-2) var(--mj-space-3);
      font-size: var(--mj-text-xs);
      gap: var(--mj-space-2);
    }
    :host(.mj-alert--sm) .mj-alert__icon { font-size: 0.875rem; }

    /* ── Variants (token-driven, dark-mode-safe) ───────────────────
       Background is an OPAQUE tint (status color mixed into the surface), NOT the
       translucent --mj-status-*-bg token. Translucent backgrounds let whatever
       sits behind the alert show through, so the same alert rendered on two
       different dialog backdrops looked different. An opaque tint is identical
       regardless of what's behind it, and still adapts to light/dark via the
       surface + status tokens. */
    :host(.mj-alert--info) {
      background: color-mix(in srgb, var(--mj-status-info) 12%, var(--mj-bg-surface));
      border-color: var(--mj-status-info-border);
      color: var(--mj-status-info-text);
    }
    :host(.mj-alert--info) .mj-alert__icon { color: var(--mj-status-info); }

    :host(.mj-alert--success) {
      background: color-mix(in srgb, var(--mj-status-success) 12%, var(--mj-bg-surface));
      border-color: var(--mj-status-success-border);
      color: var(--mj-status-success-text);
    }
    :host(.mj-alert--success) .mj-alert__icon { color: var(--mj-status-success); }

    :host(.mj-alert--warning) {
      background: color-mix(in srgb, var(--mj-status-warning) 12%, var(--mj-bg-surface));
      border-color: var(--mj-status-warning-border);
      color: var(--mj-status-warning-text);
    }
    :host(.mj-alert--warning) .mj-alert__icon { color: var(--mj-status-warning); }

    :host(.mj-alert--error) {
      background: color-mix(in srgb, var(--mj-status-error) 12%, var(--mj-bg-surface));
      border-color: var(--mj-status-error-border);
      color: var(--mj-status-error-text);
    }
    :host(.mj-alert--error) .mj-alert__icon { color: var(--mj-status-error); }
  `]
})
export class MJAlertComponent {
  /** Visual intent — drives color + default icon. Defaults to 'info'. */
  @Input() Variant: MJAlertVariant = 'info';

  /** Density — 'sm' tightens padding/font for inline/dense placements. */
  @Input() Size: MJAlertSize = 'md';

  /** Optional bold lead line. */
  @Input() Title = '';

  /** Body text. For rich content, project default `<ng-content>` instead. */
  @Input() Message = '';

  /**
   * Font Awesome icon class (e.g. "fa-solid fa-key"). When omitted, a sensible
   * default is chosen from `Variant`. Set to `''` to render no icon.
   */
  @Input() Icon: string | null = null;

  /** Show a dismiss (×) button. Accepts a bare attribute (`Dismissible`) or `[Dismissible]="expr"`. */
  @Input({ transform: booleanAttribute }) Dismissible = false;

  /**
   * ARIA live role on the host. When unset, defaults from `Variant`:
   * `error`/`warning` → `'alert'` (assertive), `info`/`success` → `'status'`
   * (polite), so a dynamically-shown alert announces itself. Pass `''` to opt out.
   */
  @Input() Role: string | null = null;

  /** Fired when the user dismisses the alert. */
  @Output() Dismissed = new EventEmitter<void>();

  protected isDismissed = false;

  // Host classes — individual ADDITIVE bindings so a consumer's own `class="…"`
  // on <mj-alert> is never clobbered (a single `@HostBinding('class')` would).
  @HostBinding('class.mj-alert--info') get IsInfo(): boolean { return this.Variant === 'info'; }
  @HostBinding('class.mj-alert--success') get IsSuccess(): boolean { return this.Variant === 'success'; }
  @HostBinding('class.mj-alert--warning') get IsWarning(): boolean { return this.Variant === 'warning'; }
  @HostBinding('class.mj-alert--error') get IsError(): boolean { return this.Variant === 'error'; }
  @HostBinding('class.mj-alert--sm') get IsSmall(): boolean { return this.Size === 'sm'; }
  @HostBinding('class.mj-alert--dismissed') get IsHidden(): boolean { return this.isDismissed; }

  /**
   * Live-region role applied to the host. Explicit `Role` wins (`''` ⇒ no role);
   * otherwise error/warning are an assertive `alert`, info/success a polite `status`.
   */
  @HostBinding('attr.role')
  get HostRole(): string | null {
    if (this.Role != null) {
      return this.Role || null;
    }
    return this.Variant === 'error' || this.Variant === 'warning' ? 'alert' : 'status';
  }

  /**
   * Icon actually rendered: the explicit `Icon` when provided (including ""
   * to suppress the icon), otherwise the per-variant default.
   */
  get ResolvedIcon(): string {
    if (this.Icon != null) {
      return this.Icon;
    }
    return MJAlertComponent.DefaultIconForVariant(this.Variant);
  }

  /** Default Font Awesome icon for each variant. */
  static DefaultIconForVariant(variant: MJAlertVariant): string {
    return DEFAULT_ICONS[variant] ?? DEFAULT_ICONS.info;
  }

  Dismiss(): void {
    this.isDismissed = true;
    this.Dismissed.emit();
  }
}
