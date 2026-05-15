import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Per-tab config understood by <mj-tab-nav>. */
export interface TabConfig {
  /** Unique key — emitted via (TabChange) when this tab is clicked. */
  key: string;
  /** Visible label. */
  label: string;
  /** Optional Font Awesome icon class (e.g. 'fa-solid fa-server'). */
  icon?: string;
  /** Optional count or short string shown in a small badge after the label. */
  badge?: number | string | null;
  /** Semantic variant for the badge (drives color). Defaults to 'default'. */
  badgeVariant?: 'default' | 'error' | 'warning' | 'success';
}

/**
 * mj-tab-nav — Canonical horizontal sub-navigation for pages that have
 * multiple top-level views (e.g. MCP: Servers / Connections / Tools / Logs;
 * Admin: Identity & Access / Data & Schema / Monitoring / Developer Tools).
 *
 * Visually distinct from `<mj-filter-chip>` (filters) — tabs are bigger,
 * have a grouped container, and a more committed active state. Both share
 * the brand-primary active color for design-language consistency.
 *
 * Example:
 * ```html
 * <mj-tab-nav
 *   [Tabs]="mcpTabs"
 *   [ActiveKey]="ActiveTab"
 *   (TabChange)="setActiveTab($event)">
 * </mj-tab-nav>
 * ```
 */
@Component({
  selector: 'mj-tab-nav',
  standalone: true,
  template: `
    <div class="mj-tab-nav" role="tablist">
      @for (tab of Tabs; track tab.key) {
        <button
          type="button"
          class="mj-tab-nav-btn"
          [class.mj-tab-nav-btn--active]="tab.key === ActiveKey"
          role="tab"
          [attr.aria-selected]="tab.key === ActiveKey"
          (click)="TabChange.emit(tab.key)">
          @if (tab.icon) {
            <i [class]="tab.icon" aria-hidden="true"></i>
          }
          <span class="mj-tab-nav-label">{{ tab.label }}</span>
          @if (tab.badge != null && tab.badge !== '') {
            <span
              class="mj-tab-nav-badge"
              [class.mj-tab-nav-badge--error]="tab.badgeVariant === 'error'"
              [class.mj-tab-nav-badge--warning]="tab.badgeVariant === 'warning'"
              [class.mj-tab-nav-badge--success]="tab.badgeVariant === 'success'">
              {{ tab.badge }}
            </span>
          }
        </button>
      }
    </div>
  `,
  styles: [`
    :host { display: inline-flex; }

    .mj-tab-nav {
      display: inline-flex;
      gap: var(--mj-space-1);
      padding: var(--mj-space-1);
      background: var(--mj-bg-surface-card);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-lg);
    }

    .mj-tab-nav-btn {
      display: inline-flex;
      align-items: center;
      gap: var(--mj-space-2);
      padding: 7px var(--mj-space-3-5);
      background: transparent;
      border: none;
      border-radius: var(--mj-radius-md);
      color: var(--mj-text-secondary);
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      line-height: 1.2;
      cursor: pointer;
      transition: background-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
      white-space: nowrap;
    }

    .mj-tab-nav-btn:hover:not(.mj-tab-nav-btn--active) {
      background: color-mix(in srgb, var(--mj-bg-surface) 70%, transparent);
      color: var(--mj-text-primary);
    }

    .mj-tab-nav-btn--active {
      background: var(--mj-bg-surface);
      color: var(--mj-brand-primary);
      box-shadow: 0 1px 3px color-mix(in srgb, var(--mj-text-primary) 12%, transparent);
    }

    .mj-tab-nav-btn i {
      font-size: 13px;
    }

    .mj-tab-nav-label {
      font-weight: 500;
    }

    /* Badge */
    .mj-tab-nav-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 22px;
      height: 18px;
      padding: 0 var(--mj-space-1-5);
      border-radius: 9px;
      background: var(--mj-border-default);
      color: var(--mj-text-muted);
      font-size: 11px;
      font-weight: 600;
      line-height: 1;
    }

    .mj-tab-nav-btn--active .mj-tab-nav-badge {
      background: color-mix(in srgb, var(--mj-brand-primary) 15%, transparent);
      color: var(--mj-brand-primary);
    }

    .mj-tab-nav-badge--error {
      background: var(--mj-status-error);
      color: var(--mj-text-inverse);
    }
    .mj-tab-nav-badge--warning {
      background: var(--mj-status-warning);
      color: var(--mj-text-inverse);
    }
    .mj-tab-nav-badge--success {
      background: var(--mj-status-success);
      color: var(--mj-text-inverse);
    }
  `]
})
export class MJTabNavComponent {
  @Input() Tabs: TabConfig[] = [];
  @Input() ActiveKey: string = '';
  @Output() TabChange = new EventEmitter<string>();
}
