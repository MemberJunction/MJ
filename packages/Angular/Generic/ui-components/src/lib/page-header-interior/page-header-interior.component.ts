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
 * Two-row card. The primary row holds page identity + state badges + actions;
 * the toolbar row holds dense controls (search, tab nav, filter chips) that
 * would compete with the title for space if they shared a row. When `[toolbar]`
 * has no projected content, the row collapses entirely.
 *
 * ```
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Title  [meta]                       [—— spacer ——]            [actions] │
 * │  subtitle                                                                │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ [ toolbar content … search / tab-nav / filter chips … ]                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 * ```
 *
 * - **`[Title]`** (input, optional) — short page name. Usually redundant with
 *   the parent shell's left-rail label; most sub-pages still set it as a visual
 *   anchor.
 * - **`[Subtitle]`** (input, optional) — short prose explaining what the page
 *   does. Recommended for pages that aren't self-explanatory from the rail
 *   label alone (e.g. Dev Tools inspectors).
 * - **`[meta]`** — top row, **adjacent to the title**: status badges, result
 *   counts, stat pills. Reads as one unit with the title ("Roles · 12 total ·
 *   4 system"). Mirrors the title-adjacent meta slot in `<mj-page-header>`.
 * - **`[toolbar]`** — second row: search, tab nav, filter chips, view toggles
 * - **`[actions]`** — top row, right edge: filter popover, refresh, secondary
 *   buttons, primary CTA
 *
 * ## Example
 *
 * ```html
 * <mj-page-header-interior Subtitle="Read-only snapshot of Explorer runtime state">
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
      <div class="mj-page-header-interior__row mj-page-header-interior__row--primary">
        <div class="mj-page-header-interior__identity">
          <div class="mj-page-header-interior__title-row">
            @if (Title) {
              <div class="mj-page-header-interior__title">{{ Title }}</div>
            }
            <div class="mj-page-header-interior__meta">
              <ng-content select="[meta]"></ng-content>
            </div>
          </div>
          @if (Subtitle) {
            <div class="mj-page-header-interior__subtitle">{{ Subtitle }}</div>
          }
        </div>
        <div class="mj-page-header-interior__spacer"></div>
        <div class="mj-page-header-interior__actions">
          <ng-content select="[actions]"></ng-content>
        </div>
      </div>
      <div class="mj-page-header-interior__row mj-page-header-interior__row--toolbar">
        <ng-content select="[toolbar]"></ng-content>
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
      flex-direction: column;
      background: var(--mj-bg-surface);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-lg);
      box-shadow: var(--mj-shadow-sm);
      overflow: hidden;
    }

    /* Slot-wrapper passthrough — any element a consumer projects with the
       \`meta\`, \`actions\`, or \`toolbar\` attribute (regardless of class name)
       becomes a transparent container so its children become direct flex
       children of the row wrapper and inherit the row's gap. Matches the
       same pattern <mj-page-header> uses. */
    :host ::ng-deep [meta],
    :host ::ng-deep [actions],
    :host ::ng-deep [toolbar] {
      display: contents;
    }


    /* Rows: primary (identity + meta + actions) and toolbar (separate row). */
    .mj-page-header-interior__row {
      display: flex;
      align-items: center;
      gap: var(--mj-space-3);
      padding: var(--mj-space-3) var(--mj-space-4);
    }

    .mj-page-header-interior__row--primary {
      gap: var(--mj-space-4);
    }

    /* Toolbar row — hidden by default, opt-in via consumer projection.

       Defaulting to display:none (instead of "show then hide when empty")
       eliminates the dangling divider + empty band on sub-pages that have
       no toolbar content (Dev Tools inspectors, action-only sections, etc.).
       The row only appears when the consumer projects a [toolbar] element
       that actually has content.

       ::ng-deep is required because the projected [toolbar] wrapper carries
       the CONSUMER's view-encapsulation scope, not ours — a scoped selector
       for [toolbar] would never match the projected wrapper, so we have to
       escape our scope to see it. The matched-content rule restores all
       the row's intended styling (flex layout, padding, divider). */
    .mj-page-header-interior__row--toolbar {
      display: none;
    }

    :host ::ng-deep .mj-page-header-interior__row--toolbar:has(> [toolbar]:has(*)) {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--mj-space-3);
      padding: var(--mj-space-3) var(--mj-space-4);
      border-top: 1px solid var(--mj-border-subtle);
    }

    .mj-page-header-interior__identity {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
      flex-shrink: 1;
      min-width: 0;
    }

    /* Title row — title text + [meta] slot, side by side. Matches the title-row
       pattern in <mj-page-header>. Meta sits adjacent to the title so "Title (3
       active)" reads as one unit. */
    .mj-page-header-interior__title-row {
      display: flex;
      align-items: center;
      gap: var(--mj-space-3);
      flex-wrap: wrap;
      min-width: 0;
    }
    /* Identity typography matches <mj-page-header> exactly — same title size,
       same subtitle size, same colors. One mental model across both chrome
       surfaces. */
    .mj-page-header-interior__title {
      font-size: var(--mj-text-xl);
      font-weight: var(--mj-font-semibold);
      color: var(--mj-text-primary);
      line-height: 1.25;
    }
    .mj-page-header-interior__subtitle {
      font-size: var(--mj-text-sm);
      color: var(--mj-text-secondary);
      line-height: 1.4;
    }

    .mj-page-header-interior__spacer {
      flex: 1 1 auto;
      min-width: 0;
    }

    .mj-page-header-interior__meta,
    .mj-page-header-interior__actions {
      display: inline-flex;
      align-items: center;
      gap: var(--mj-space-2);
      flex-shrink: 0;
    }

    .mj-page-header-interior__actions {
      gap: var(--mj-space-3);
    }

    /* Collapse the meta + actions wrappers when there's nothing projected. */
    .mj-page-header-interior__meta:empty,
    .mj-page-header-interior__actions:empty {
      display: none;
    }

    /* Collapse the identity wrapper when nothing is projected — covers the
       no-title / no-subtitle / no-meta case. The :empty check is on the
       title-row sub-element because that's where ng-content lives. */
    .mj-page-header-interior__identity:has(.mj-page-header-interior__title-row:empty):not(:has(.mj-page-header-interior__subtitle)) {
      display: none;
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

  /**
   * Optional short page name rendered as the identity block on the left of the
   * card. Usually redundant with the parent shell's left-rail label, so most
   * sub-pages omit this and rely on Subtitle alone.
   */
  @Input() Title: string | null = null;

  /**
   * Optional one-line description rendered under Title (or alone, if Title is
   * not set). Recommended for pages whose purpose isn't obvious from the rail
   * label — e.g. Dev Tools inspectors. Keep it short — one line at typical
   * widths.
   */
  @Input() Subtitle: string | null = null;
}
