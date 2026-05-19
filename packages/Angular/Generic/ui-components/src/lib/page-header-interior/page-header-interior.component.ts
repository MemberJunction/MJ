import { Component, Input } from '@angular/core';

/**
 * `<mj-page-header-interior>` — Interior-chrome sibling of `<mj-page-header>`.
 *
 * Same slot conventions as `<mj-page-header>` (`[meta]` / `[actions]` / `[toolbar]`)
 * so consumers learn one set of names for both surfaces. Different visual shape:
 * a single-row card with surface background + radius + shadow that sits at the
 * top of a sub-page's body, NOT a page-level chrome band.
 *
 * Use this when a sub-page renders inside a left-nav shell that already owns the
 * page-level `<mj-page-header>` — the rail's active-item highlight is the section
 * indicator, so the sub-page doesn't need its own title row; just the filter /
 * action surface in a clean card.
 *
 * ## Layout
 *
 * ```
 * [ toolbar content ……… ]  [—— spacer ——]  [meta]  [actions]
 * ```
 *
 * - **`[toolbar]`** — left side: search, visible filter chips, view toggles
 * - **`[meta]`** — right side, before actions: status badges, result counts
 * - **`[actions]`** — right edge: filter popover, refresh, secondary buttons, primary CTA
 *
 * ## Example
 *
 * ```html
 * <mj-page-header-interior>
 *   <div toolbar>
 *     <mj-page-search [Value]="searchTerm" (ValueChange)="onSearch($event)" />
 *     <mj-filter-chip Label="Active" [Active]="status === 'active'"
 *                     (Clicked)="setStatus('active')" />
 *   </div>
 *   <div actions>
 *     <mj-filter-popover ...><mj-filter-panel ...></mj-filter-panel></mj-filter-popover>
 *     <mj-refresh-button [Loading]="isLoading" (Clicked)="refresh()" />
 *     <button mjButton variant="primary" size="sm">+ Add</button>
 *   </div>
 * </mj-page-header-interior>
 * ```
 *
 * See Section 10 of `plans/explorer-chrome-conventions.md` for the full
 * "interior chrome" contract.
 */
@Component({
  selector: 'mj-page-header-interior',
  standalone: true,
  template: `
    <div class="mj-page-header-interior"
         [attr.role]="Role"
         [attr.aria-label]="AriaLabel">
      <div class="mj-page-header-interior__toolbar">
        <ng-content select="[toolbar]"></ng-content>
      </div>
      <div class="mj-page-header-interior__spacer"></div>
      <div class="mj-page-header-interior__meta">
        <ng-content select="[meta]"></ng-content>
      </div>
      <div class="mj-page-header-interior__actions">
        <ng-content select="[actions]"></ng-content>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      margin: var(--mj-space-4) var(--mj-space-4) var(--mj-space-3);
    }

    .mj-page-header-interior {
      display: flex;
      align-items: center;
      gap: var(--mj-space-3);
      flex-wrap: wrap;
      padding: var(--mj-space-3) var(--mj-space-4);
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-lg);
      box-shadow: var(--mj-shadow-sm);
    }

    .mj-page-header-interior__toolbar,
    .mj-page-header-interior__meta,
    .mj-page-header-interior__actions {
      display: inline-flex;
      align-items: center;
      gap: var(--mj-space-3);
      flex-shrink: 0;
    }

    /* Slot-wrapper passthrough — any element a consumer projects with the
       \`meta\`, \`actions\`, or \`toolbar\` attribute (regardless of class name)
       becomes a transparent container so its children become direct flex
       children of the slot wrapper and inherit the wrapper's gap. Matches the
       same pattern <mj-page-header> uses. */
    :host ::ng-deep [meta],
    :host ::ng-deep [actions],
    :host ::ng-deep [toolbar] {
      display: contents;
    }

    /* Collapse the meta + actions wrappers when there's nothing projected, so
       a sub-page that only uses [toolbar] doesn't leave dangling gap space. */
    .mj-page-header-interior__meta:empty,
    .mj-page-header-interior__actions:empty {
      display: none;
    }

    .mj-page-header-interior__spacer {
      flex: 1 1 auto;
      min-width: 0;
    }

    /* No .mj-btn reset here. Buttons projected into the chrome inherit the
       mjButton directive's global styles from button.scss — see "Button Styling"
       in packages/Angular/CLAUDE.md. */
  `]
})
export class MJPageHeaderInteriorComponent {
  /**
   * ARIA role applied to the rendered card. Defaults to `'search'` since the
   * dominant use case is a filter / search region. Pass `null` to omit the
   * role attribute (for non-filter chrome — e.g. a settings-only action band).
   */
  @Input() Role: string | null = 'search';

  /**
   * Accessible label for the rendered card. When set, the card becomes a
   * labeled landmark for assistive tech. Recommended to set this for any
   * chrome that represents a meaningful region (e.g. "Filter users").
   */
  @Input() AriaLabel: string | null = null;
}
