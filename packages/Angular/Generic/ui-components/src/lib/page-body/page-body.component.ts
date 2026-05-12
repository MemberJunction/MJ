import { Component, HostBinding, Input } from '@angular/core';

/**
 * mj-page-body — Standard body region for MJ Explorer dashboards / resource pages.
 *
 * Sits inside `<mj-page-layout>` after `<mj-page-header>`. Provides the canonical
 * page body recipe: `flex: 1`, `min-height: 0`, padded gutters, vertical scroll.
 *
 * Escape hatches:
 *  - `[Padding]="false"` — remove the 24px horizontal/bottom gutter (e.g., pages
 *    whose inner content owns the gutter itself, like File Browser).
 *  - `[Scroll]="false"` — disable internal vertical scroll for pages that manage
 *    their own scroll regions (e.g., split-pane layouts).
 *  - `[Flex]="true"` — switch the body to `flex; flex-direction: column;
 *    position: relative` so a child marked `flex: 1` (e.g., a main content area
 *    that should fill remaining height under a banner row) can grow correctly.
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
      padding: 0 24px 24px;
      overflow-y: auto;
    }
    :host(.mj-page-body--no-padding) {
      padding: 0;
    }
    :host(.mj-page-body--no-scroll) {
      overflow-y: visible;
      min-height: auto;
    }
    :host(.mj-page-body--flex) {
      display: flex;
      flex-direction: column;
      position: relative;
    }
  `]
})
export class MJPageBodyComponent {
  /** When `false`, removes the default 24px horizontal/bottom gutter. Defaults to `true`. */
  @Input() Padding: boolean = true;

  /** When `false`, disables internal vertical scroll. Defaults to `true`. */
  @Input() Scroll: boolean = true;

  /**
   * When `true`, switches the body to flex-column layout (with `position: relative`)
   * so a child marked `flex: 1` can fill the remaining vertical space — e.g., a main
   * content area sitting under a banner row. Defaults to `false` (block flow).
   */
  @Input() Flex: boolean = false;

  @HostBinding('class.mj-page-body--no-padding')
  get NoPaddingClass(): boolean {
    return !this.Padding;
  }

  @HostBinding('class.mj-page-body--no-scroll')
  get NoScrollClass(): boolean {
    return !this.Scroll;
  }

  @HostBinding('class.mj-page-body--flex')
  get FlexClass(): boolean {
    return this.Flex;
  }
}
