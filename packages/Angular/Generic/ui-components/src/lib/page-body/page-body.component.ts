import { Component, HostBinding, Input } from '@angular/core';

/**
 * mj-page-body — Standard body region for MJ Explorer dashboards / resource pages.
 *
 * Sits inside `<mj-page-layout>` after `<mj-page-header>`. Provides the canonical
 * page body recipe: `flex: 1`, `min-height: 0`, padded gutters, vertical scroll.
 *
 * Escape hatches:
 *  - `[Padding]="false"` — remove the 24px gutter (e.g., pages whose inner
 *    content owns the gutter itself, like File Browser or AI Analytics shell).
 *  - `[Flex]="true"` — switch the body to `flex; flex-direction: column;
 *    position: relative` so a child marked `flex: 1` (e.g., a main content area
 *    that should fill remaining height under a banner row) can grow correctly.
 *
 * Note: overflow-y is intentionally always `auto` and not configurable.
 * `mj-page-layout` already has `overflow: hidden`, so any body content that
 * exceeds the visible area would be silently clipped if the body itself didn't
 * scroll. Pages with split-pane layouts whose children manage their own scroll
 * regions should use `min-height: 0 + flex: 1` on the inner panes so nothing
 * overflows the body — auto stays harmlessly inactive.
 *
 * Example:
 * ```html
 * <mj-page-layout>
 *   <mj-page-header Title="Jobs" Icon="fa-solid fa-calendar-check"></mj-page-header>
 *   <mj-page-body>
 *     <!-- page content -->
 *   </mj-page-body>
 * </mj-page-layout>
 * ```
 */
@Component({
  selector: 'mj-page-body',
  standalone: true,
  template: `<ng-content></ng-content>`,
  styles: [`
    :host {
      display: block;
      flex: 1;
      min-height: 0;
      /* Top padding doubles as header-to-body spacing — <mj-page-header>
         intentionally has no margin-bottom so [Padding]="false" yields a
         truly flush layout (e.g. AI Analytics sidebar+content). */
      padding: var(--mj-space-6);
      overflow-y: auto;
    }
    :host(.mj-page-body--no-padding) {
      padding: 0;
    }
    :host(.mj-page-body--flex) {
      display: flex;
      flex-direction: column;
      position: relative;
    }
    /* Direction="row" — switch flex direction when [Flex]="true". Used by
       shells whose body is a left-rail + content layout (Admin shells, KH
       Config, AI Analytics). Replaces the bespoke per-shell-container body
       grid/flex wrapper that every shell used to declare. */
    :host(.mj-page-body--flex.mj-page-body--row) {
      flex-direction: row;
    }
    /* On mobile a left-rail + content row can't coexist horizontally — the rail
       (mj-left-nav) collapses to a full-width drawer trigger at ≤700px, so the
       row must stack: the trigger bar on top, the content pane filling the rest.
       Pairs with mj-left-nav-content's min-height:0 so the content still scrolls. */
    @media (max-width: 700px) {
      :host(.mj-page-body--flex.mj-page-body--row) {
        flex-direction: column;
      }
    }
  `]
})
export class MJPageBodyComponent {
  /** When `false`, removes the default 24px gutter. Defaults to `true`. */
  @Input() Padding: boolean = true;

  /**
   * When `true`, switches the body to flex layout (with `position: relative`)
   * so a child marked `flex: 1` can fill the remaining vertical space — e.g., a main
   * content area sitting under a banner row. Defaults to `false` (block flow).
   *
   * Combine with `Direction="row"` to lay out children left-to-right (rail + content).
   */
  @Input() Flex: boolean = false;

  /**
   * When `Flex=true`, controls the flex direction. `'column'` (default) stacks
   * children vertically. `'row'` lays them out left-to-right, useful for
   * left-rail + content shells (Admin's `admin-container`, KH Config, etc.).
   * Ignored when `Flex=false`.
   */
  @Input() Direction: 'row' | 'column' = 'column';

  @HostBinding('class.mj-page-body--no-padding')
  get NoPaddingClass(): boolean {
    return !this.Padding;
  }

  @HostBinding('class.mj-page-body--flex')
  get FlexClass(): boolean {
    return this.Flex;
  }

  @HostBinding('class.mj-page-body--row')
  get RowClass(): boolean {
    return this.Flex && this.Direction === 'row';
  }
}
