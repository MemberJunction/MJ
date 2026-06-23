import { Component, EventEmitter, HostBinding, Input, Output } from '@angular/core';
import { MJButtonDirective } from '../button/button.directive';

/**
 * Visual intent of an `<mj-empty-state>`. Drives the default icon and the icon's
 * color treatment so callers don't restate either for the common cases.
 *
 * - `empty`      — nothing exists yet (default). Neutral/disabled icon tone.
 * - `no-results` — a search/filter matched nothing. Muted icon tone, magnifier default.
 * - `success`    — a positive "all clear" empty (e.g. "No Errors Found"). Success icon tone, check default.
 * - `warning`    — a non-error blocking condition (disabled/misconfigured feature). Warning icon tone.
 * - `error`      — a load/operation failed. Error icon tone, triangle default.
 */
export type MJEmptyStateVariant = 'empty' | 'no-results' | 'success' | 'warning' | 'error';

/** Density of an `<mj-empty-state>` — controls padding and icon size. */
export type MJEmptyStateSize = 'compact' | 'default' | 'large';

/**
 * mj-empty-state — Canonical centered empty/no-results/error placeholder.
 *
 * Replaces the ~213 inline empty-state `<div>`s that pages were each hand-rolling
 * (icon + title + message, optionally a CTA), e.g.:
 * ```html
 * <div class="empty-state">
 *   <i class="fa-solid fa-inbox"></i>
 *   <h3>No Permissions Found</h3>
 *   <p>Try adjusting your filters or refresh the data.</p>
 *   <button mjButton variant="primary" (click)="refreshData()">Refresh</button>
 * </div>
 * ```
 *
 * Usage:
 * ```html
 * <!-- Simplest: nothing-here placeholder -->
 * <mj-empty-state Title="No runs found" Message="No runs match the selected filters." />
 *
 * <!-- Search/filter produced nothing -->
 * <mj-empty-state Variant="no-results" Title="No icons found" Message="Try a different search term." />
 *
 * <!-- Load failed, retry CTA -->
 * <mj-empty-state Variant="error" Title="Couldn't load permissions" [Message]="error"
 *                 ActionText="Try Again" ActionIcon="fa-solid fa-rotate-right" (Action)="loadData()" />
 *
 * <!-- Invitation to create the first record -->
 * <mj-empty-state Icon="fa-solid fa-key" Title="No API keys yet"
 *                 Message="Generate a key to start calling the API."
 *                 ActionText="Generate Your First Key" ActionIcon="fa-solid fa-plus"
 *                 (Action)="requestCreate()" />
 *
 * <!-- Multiple / bespoke CTAs: project them into the [actions] slot -->
 * <mj-empty-state Title="No pinned items yet" Message="Pin dashboards for quick access.">
 *   <button mjButton variant="primary" (click)="addPin()">Add your first pin</button>
 *   <button mjButton variant="flat" (click)="dismiss()">Don't show again</button>
 * </mj-empty-state>
 * ```
 *
 * For dynamic messages (e.g. "No keys matching X" vs "No keys yet"), compute the
 * string in the parent and bind it to `[Message]`, or project richer body content
 * as default `<ng-content>` (rendered between the message and the actions).
 */
@Component({
  selector: 'mj-empty-state',
  standalone: true,
  imports: [MJButtonDirective],
  template: `
    @if (ResolvedIcon) {
      <i class="mj-empty-state__icon {{ ResolvedIcon }}" aria-hidden="true"></i>
    }
    @if (Title) {
      <h3 class="mj-empty-state__title">{{ Title }}</h3>
    }
    @if (Message) {
      <p class="mj-empty-state__message">{{ Message }}</p>
    }

    <!-- Optional richer body content (feature lists, dynamic text, links) -->
    <ng-content></ng-content>

    <!-- Actions: the built-in single CTA and/or projected [actions] buttons.
         Hidden via :empty when neither is present. -->
    <div class="mj-empty-state__actions">
      @if (ActionText) {
        <button type="button" mjButton [variant]="ActionVariant" (click)="OnAction($event)">
          @if (ActionIcon) {
            <i class="{{ ActionIcon }}" aria-hidden="true"></i>
          }
          {{ ActionText }}
        </button>
      }
      <ng-content select="[actions]"></ng-content>
    </div>
  `,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: var(--mj-space-12);
      color: var(--mj-text-secondary);
    }

    .mj-empty-state__icon {
      font-size: 3rem;
      line-height: 1;
      margin-bottom: var(--mj-space-4);
      color: var(--mj-text-disabled);
    }

    .mj-empty-state__title {
      margin: 0;
      font-size: var(--mj-text-lg);
      font-weight: 600;
      color: var(--mj-text-primary);
    }

    .mj-empty-state__message {
      margin: var(--mj-space-2) 0 0;
      font-size: var(--mj-text-sm);
      color: var(--mj-text-muted);
      max-width: 420px;
    }

    .mj-empty-state__actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: var(--mj-space-2);
      margin-top: var(--mj-space-6);
    }
    /* Collapse the actions row entirely when no CTA is rendered (modern browsers
       treat an element containing only Angular's @if comment-anchors as :empty). */
    .mj-empty-state__actions:empty {
      display: none;
    }

    /* ── Sizes ────────────────────────────────────────────────── */
    :host(.mj-empty-state--compact) {
      padding: var(--mj-space-8);
    }
    :host(.mj-empty-state--compact) .mj-empty-state__icon {
      font-size: 2rem;
      margin-bottom: var(--mj-space-3);
    }

    :host(.mj-empty-state--large) {
      padding: var(--mj-space-16) var(--mj-space-10);
    }
    :host(.mj-empty-state--large) .mj-empty-state__icon {
      font-size: 4rem;
    }

    /* ── Variants (icon tone) ─────────────────────────────────── */
    :host(.mj-empty-state--no-results) .mj-empty-state__icon {
      color: var(--mj-text-muted);
    }
    :host(.mj-empty-state--success) .mj-empty-state__icon {
      color: var(--mj-status-success);
    }
    :host(.mj-empty-state--warning) .mj-empty-state__icon {
      color: var(--mj-status-warning);
    }
    :host(.mj-empty-state--error) .mj-empty-state__icon {
      color: var(--mj-status-error);
    }
  `]
})
export class MJEmptyStateComponent {
  /**
   * Font Awesome icon class string (e.g. "fa-solid fa-key"). When omitted, a
   * sensible default is chosen from `Variant`. Pass an empty string AND no
   * variant default applies — set this explicitly to "" to render no icon.
   */
  @Input() Icon: string | null = null;

  /** Bold heading line (e.g. "No API keys yet"). */
  @Input() Title: string = '';

  /** Supporting/help text below the title. */
  @Input() Message: string = '';

  /** When set, renders a primary CTA button with this label. */
  @Input() ActionText: string = '';

  /** Optional Font Awesome icon shown inside the CTA button. */
  @Input() ActionIcon: string = '';

  /** mjButton variant for the built-in CTA. Defaults to 'primary'. */
  @Input() ActionVariant: 'primary' | 'secondary' | 'outline' | 'flat' = 'primary';

  /** Visual intent — drives the default icon and icon color. Defaults to 'empty'. */
  @Input() Variant: MJEmptyStateVariant = 'empty';

  /** Density — controls padding and icon size. Defaults to 'default'. */
  @Input() Size: MJEmptyStateSize = 'default';

  /** Emitted when the built-in CTA button is clicked. */
  @Output() Action = new EventEmitter<MouseEvent>();

  @HostBinding('class.mj-empty-state--compact')
  get IsCompact(): boolean { return this.Size === 'compact'; }

  @HostBinding('class.mj-empty-state--large')
  get IsLarge(): boolean { return this.Size === 'large'; }

  @HostBinding('class.mj-empty-state--no-results')
  get IsNoResults(): boolean { return this.Variant === 'no-results'; }

  @HostBinding('class.mj-empty-state--success')
  get IsSuccess(): boolean { return this.Variant === 'success'; }

  @HostBinding('class.mj-empty-state--warning')
  get IsWarning(): boolean { return this.Variant === 'warning'; }

  @HostBinding('class.mj-empty-state--error')
  get IsError(): boolean { return this.Variant === 'error'; }

  /**
   * Icon actually rendered: the explicit `Icon` when provided (including ""
   * to suppress the icon), otherwise the per-variant default.
   */
  get ResolvedIcon(): string {
    if (this.Icon != null) {
      return this.Icon;
    }
    return MJEmptyStateComponent.DefaultIconForVariant(this.Variant);
  }

  /** Default Font Awesome icon for each variant. */
  static DefaultIconForVariant(variant: MJEmptyStateVariant): string {
    switch (variant) {
      case 'no-results':
        return 'fa-solid fa-magnifying-glass';
      case 'success':
        return 'fa-solid fa-circle-check';
      case 'warning':
      case 'error':
        return 'fa-solid fa-triangle-exclamation';
      case 'empty':
      default:
        return 'fa-solid fa-inbox';
    }
  }

  OnAction(event: MouseEvent): void {
    this.Action.emit(event);
  }
}
