import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * A single item in an `<mj-left-nav>`.
 */
export interface MJLeftNavItem {
  /** Stable identifier — used for active-state matching and emitted on click. */
  id: string;
  /** Primary label rendered as the item's main text. */
  label: string;
  /** Optional Font Awesome icon class (e.g. `'fa-solid fa-users'`). */
  icon?: string;
  /** Optional muted secondary line shown under the label. */
  description?: string;
  /** Optional count badge rendered at the right of the item. */
  badge?: string | number;
  /** When `true`, the item renders dimmed and is not clickable. */
  disabled?: boolean;
  /**
   * Optional child items for tree-structured nav (e.g. Testing Explorer's
   * Test Suites tree). When `children` is `undefined` the item renders as a
   * plain flat-list item (existing behavior). When defined — even as an empty
   * array — the item participates in tree rendering: a chevron toggle shows
   * for non-empty arrays, and an equal-width placeholder reserves alignment
   * space for leaves so siblings line up. Expansion state is owned by the
   * consumer via `[ExpandedIds]` on `<mj-left-nav>`.
   */
  children?: MJLeftNavItem[];
}

/**
 * A grouped section in an `<mj-left-nav>`. The optional `label` renders as an
 * uppercase section header above the items. Sections WITHOUT a label still
 * group items together (use multiple unlabeled sections to get visual dividers
 * without headers).
 */
export interface MJLeftNavSection {
  /** Optional uppercase header above the items in this section. */
  label?: string;
  /** The clickable items in this section. */
  items: MJLeftNavItem[];
}

/**
 * `<mj-left-nav>` — Canonical left rail for MJ Explorer dashboards that have
 * an internal section-nav (Admin shells, KH Config, KH Analytics, AI Analytics,
 * Communication, Credentials, APIKeys, etc.).
 *
 * Replaces the bespoke `.{name}-nav` / `.{name}-nav-item` patterns each of
 * those dashboards used to declare in their own CSS files.
 *
 * Supports:
 *  - Plain items (icon + label)
 *  - Items with a muted secondary description line (Admin shells pattern)
 *  - Items with a count badge (APIKeys pattern)
 *  - Sections with uppercase headers (Communication / Credentials pattern)
 *  - Optional `[header]` and `[footer]` content slots (KH Config logo header, etc.)
 *  - Responsive collapse-to-row at narrow viewports (consumer controls parent's
 *    flex-direction switch; the rail's own styles handle item wrapping + the
 *    description-hide behavior)
 *
 * ## Example
 *
 * ```typescript
 * sections: MJLeftNavSection[] = [
 *   {
 *     items: [
 *       { id: 'users',  icon: 'fa-solid fa-users',         label: 'Users',  description: 'Manage user accounts' },
 *       { id: 'roles',  icon: 'fa-solid fa-user-shield',   label: 'Roles',  description: 'Define roles and assignments' },
 *     ]
 *   }
 * ];
 * activeId = 'users';
 * ```
 *
 * ```html
 * <mj-left-nav
 *   [Sections]="sections"
 *   [ActiveId]="activeId"
 *   (ItemClicked)="onItemClicked($event)">
 * </mj-left-nav>
 * ```
 *
 * Responsive collapse — the rail's own CSS handles narrow-viewport item
 * wrapping. The consumer is responsible for switching the parent's
 * flex-direction from row → column at the same breakpoint, e.g. via
 * `<mj-page-body>` Direction="row" with a `@media` override in the shell's CSS.
 */
@Component({
  selector: 'mj-left-nav',
  standalone: true,
  imports: [CommonModule],
  template: `
    <aside class="mj-left-nav" [style.width.px]="Width" role="navigation">
      <ng-content select="[header]"></ng-content>

      @for (section of Sections; track $index) {
        @if (section.label) {
          <div class="mj-left-nav__section-label">{{ section.label }}</div>
        }
        @for (item of section.items; track item.id) {
          <ng-container
            *ngTemplateOutlet="itemTpl; context: { item: item, depth: 0, hasExpandable: HasExpandableItems(section.items) }">
          </ng-container>
        }
      }

      <ng-content select="[footer]"></ng-content>
    </aside>

    <!-- Recursive item template — renders one item plus, when expanded,
         its children indented by depth. The hasExpandable flag is computed
         once per section and threaded through the recursion so leaf nodes
         only reserve a chevron-column placeholder when a sibling actually
         shows a chevron. -->
    <ng-template #itemTpl let-item="item" let-depth="depth" let-hasExpandable="hasExpandable">
      @if (item.children !== undefined && hasExpandable) {
        <!-- Tree row: chevron (when this node has children) or placeholder
             (when a sibling has children but this leaf needs alignment). -->
        <div
          class="mj-left-nav__row"
          [style.padding-left.px]="depth * 14">
          @if (item.children.length > 0) {
            <button
              type="button"
              class="mj-left-nav__chevron"
              [attr.aria-label]="IsExpanded(item.id) ? 'Collapse' : 'Expand'"
              [attr.aria-expanded]="IsExpanded(item.id)"
              (click)="OnItemToggle($event, item)">
              <i class="fa-solid"
                 [class.fa-chevron-down]="IsExpanded(item.id)"
                 [class.fa-chevron-right]="!IsExpanded(item.id)"
                 aria-hidden="true"></i>
            </button>
          } @else {
            <span class="mj-left-nav__chevron-placeholder" aria-hidden="true"></span>
          }
          <ng-container
            *ngTemplateOutlet="itemBtn; context: { item: item }">
          </ng-container>
        </div>

        @if (item.children.length > 0 && IsExpanded(item.id)) {
          @for (child of item.children; track child.id) {
            <ng-container
              *ngTemplateOutlet="itemTpl; context: { item: child, depth: depth + 1, hasExpandable: hasExpandable }">
            </ng-container>
          }
        }
      } @else {
        <!-- Flat render: item.children is undefined, OR no sibling in this
             section is actually expandable — render the button directly with
             no chevron column reserved. -->
        <ng-container
          *ngTemplateOutlet="itemBtn; context: { item: item }">
        </ng-container>
      }
    </ng-template>

    <!-- Item button — shared by both flat and tree rendering paths -->
    <ng-template #itemBtn let-item="item">
      <button
        type="button"
        class="mj-left-nav__item"
        [class.mj-left-nav__item--active]="item.id === ActiveId"
        [class.mj-left-nav__item--disabled]="item.disabled"
        [disabled]="item.disabled"
        [attr.aria-current]="item.id === ActiveId ? 'page' : null"
        (click)="OnItemClick(item)">
        @if (item.icon) {
          <i class="mj-left-nav__icon" [class]="item.icon" aria-hidden="true"></i>
        }
        <span class="mj-left-nav__text">
          <span class="mj-left-nav__label">{{ item.label }}</span>
          @if (item.description) {
            <span class="mj-left-nav__description">{{ item.description }}</span>
          }
        </span>
        @if (item.badge != null) {
          <span class="mj-left-nav__badge">{{ item.badge }}</span>
        }
      </button>
    </ng-template>
  `,
  styles: [`
    :host {
      display: block;
      flex-shrink: 0;
    }

    .mj-left-nav {
      height: 100%;
      background: var(--mj-bg-surface);
      border-right: 1px solid var(--mj-border-default);
      overflow-y: auto;
      padding: 8px;
      box-sizing: border-box;
    }

    .mj-left-nav__section-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--mj-text-muted);
      padding: 12px 12px 6px;
    }

    .mj-left-nav__section-label:first-child {
      padding-top: 6px;
    }

    .mj-left-nav__item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 10px 12px;
      width: 100%;
      border: none;
      background: transparent;
      border-radius: 8px;
      cursor: pointer;
      transition: background-color 0.12s ease, color 0.12s ease;
      margin-bottom: 2px;
      font-family: inherit;
      color: var(--mj-text-secondary);
      text-align: left;
    }

    .mj-left-nav__item:hover:not(.mj-left-nav__item--disabled) {
      background: var(--mj-bg-surface-hover);
      color: var(--mj-text-primary);
    }

    .mj-left-nav__item--active {
      background: color-mix(in srgb, var(--mj-brand-primary) 10%, transparent);
      color: var(--mj-brand-primary);
    }

    .mj-left-nav__item--active:hover {
      background: color-mix(in srgb, var(--mj-brand-primary) 14%, transparent);
    }

    .mj-left-nav__item--disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .mj-left-nav__icon {
      width: 18px;
      text-align: center;
      font-size: 13px;
      margin-top: 1px;
      flex-shrink: 0;
      color: inherit;
    }

    .mj-left-nav__text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .mj-left-nav__label {
      font-size: 13px;
      font-weight: 500;
      line-height: 1.2;
    }

    .mj-left-nav__description {
      font-size: 11px;
      color: var(--mj-text-muted);
      margin-top: 3px;
      line-height: 1.3;
    }

    .mj-left-nav__item--active .mj-left-nav__description {
      color: color-mix(in srgb, var(--mj-brand-primary) 70%, var(--mj-text-muted));
    }

    .mj-left-nav__badge {
      margin-left: auto;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--mj-bg-surface-sunken);
      color: var(--mj-text-secondary);
      align-self: center;
    }

    .mj-left-nav__item--active .mj-left-nav__badge {
      background: color-mix(in srgb, var(--mj-brand-primary) 18%, transparent);
      color: var(--mj-brand-primary);
    }

    /* ── Tree rendering ─────────────────────────────────────────────────────
       Used when MJLeftNavItem.children is defined (even as an empty array).
       The row wraps a chevron/placeholder + the item button so they sit on
       one line, and depth-based padding-left is applied to the row (not the
       item) so the chevron aligns with the depth column. */

    .mj-left-nav__row {
      display: flex;
      align-items: stretch;
      gap: 2px;
    }

    .mj-left-nav__row .mj-left-nav__item {
      flex: 1;
      min-width: 0;
    }

    .mj-left-nav__chevron {
      flex-shrink: 0;
      width: 20px;
      height: 32px;
      align-self: center;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      border-radius: 4px;
      cursor: pointer;
      color: var(--mj-text-muted);
      font-size: 10px;
      padding: 0;
      transition: background-color 0.12s ease, color 0.12s ease;
      font-family: inherit;
    }

    .mj-left-nav__chevron:hover {
      background: var(--mj-bg-surface-hover);
      color: var(--mj-text-primary);
    }

    .mj-left-nav__chevron-placeholder {
      flex-shrink: 0;
      width: 20px;
      display: inline-block;
    }

    /* Responsive collapse: at narrow viewports the rail becomes a top bar of
       wrapping items. The consumer is still responsible for switching the
       parent's flex-direction from row → column (see <mj-page-body> Direction
       + the shell's @media override). */
    @media (max-width: 700px) {
      :host {
        width: 100% !important;
      }
      .mj-left-nav {
        width: 100%;
        height: auto;
        max-height: 220px;
        border-right: none;
        border-bottom: 1px solid var(--mj-border-default);
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }
      .mj-left-nav__item {
        flex: 1 1 calc(50% - 8px);
        margin-bottom: 0;
      }
      .mj-left-nav__description {
        display: none;
      }
      .mj-left-nav__section-label {
        flex-basis: 100%;
      }
      /* Tree rows take a full line even in the wrap layout — chevron + item
         should stay paired rather than flow as separate flex children. */
      .mj-left-nav__row {
        flex-basis: 100%;
        padding-left: 0 !important;
      }
    }
  `]
})
export class MJLeftNavComponent {
  /**
   * The sections + items that make up the rail. Sections render top-to-bottom
   * in array order; items inside each section render in array order.
   */
  @Input() Sections: MJLeftNavSection[] = [];

  /**
   * The id of the currently active item. Items matching this id get the
   * active styling and `aria-current="page"`.
   */
  @Input() ActiveId: string | null = null;

  /**
   * Width of the rail in pixels. Defaults to 240. Set to a smaller value
   * (e.g., 200) for denser shells.
   */
  @Input() Width: number = 240;

  /**
   * Ids of currently-expanded tree items. Items whose id appears here render
   * with a down-chevron and their `children` are visible; items not in this
   * list render with a right-chevron and their children stay collapsed.
   * Consumer owns the state — toggle in response to `(ItemToggled)`.
   *
   * Only applies to items where `children !== undefined`; flat items ignore it.
   */
  @Input() ExpandedIds: string[] = [];

  /**
   * Emitted when a non-disabled item is clicked.
   */
  @Output() ItemClicked = new EventEmitter<MJLeftNavItem>();

  /**
   * Emitted when a tree item's chevron is clicked. Consumer should toggle
   * the item's id in / out of `ExpandedIds`. Does NOT also fire `ItemClicked`.
   */
  @Output() ItemToggled = new EventEmitter<MJLeftNavItem>();

  OnItemClick(item: MJLeftNavItem): void {
    if (item.disabled) return;
    this.ItemClicked.emit(item);
  }

  OnItemToggle(event: Event, item: MJLeftNavItem): void {
    event.stopPropagation();
    this.ItemToggled.emit(item);
  }

  IsExpanded(id: string): boolean {
    return this.ExpandedIds.indexOf(id) >= 0;
  }

  /**
   * Whether any top-level item in this section actually has children to expand.
   * The template calls this once per section; the result is threaded through
   * the recursive itemTpl so leaf nodes only reserve a chevron-column
   * placeholder when a sibling will actually render a chevron.
   *
   * Top-level check is sufficient — if a deeply-nested item has children, its
   * parent's `children.length > 0` already qualifies the section as expandable.
   */
  HasExpandableItems(items: MJLeftNavItem[]): boolean {
    for (const item of items) {
      if (item.children && item.children.length > 0) return true;
    }
    return false;
  }
}
