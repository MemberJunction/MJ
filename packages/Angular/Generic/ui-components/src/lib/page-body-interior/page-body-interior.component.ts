import { Component, HostBinding, Input } from '@angular/core';

/**
 * `<mj-page-body-interior>` — Body-region sibling of `<mj-page-header-interior>`.
 *
 * Paired primitive for sub-pages that render inside a left-nav workspace shell.
 * Where `<mj-page-body>` is for top-level pages (sits inside `<mj-page-layout>`),
 * this component is for sub-pages whose host element already has the flex-column
 * layout (typically via `_admin-patterns.css`'s `:host` rule or an equivalent).
 *
 * Owns:
 * - `flex: 1` so it fills the space below `<mj-page-header-interior>`.
 * - `overflow-y: auto` so the body scrolls (the host typically has `overflow: hidden`).
 * - Responsive padding: 16px on mobile, 24px at 768px+, 32px at 1024px+.
 *   Mirrors the bespoke `.scrollable-content` rules in
 *   `packages/Angular/Explorer/explorer-settings/src/lib/shared/styles/_admin-patterns.css`.
 *
 * Background is fixed to `--mj-bg-page` to match `<mj-left-nav-content>`'s
 * background (the typical parent in shell sub-page contexts). The interior
 * chrome's own surface + shadow provides the visual delineation between chrome
 * and body — no second background tone needed.
 *
 * Escape hatches:
 *  - `[Padding]="false"` — remove the gutter (e.g. when inner content owns padding).
 *  - `[Flex]="true"` + `[Direction]="'row'"` — switch the body to a flex container
 *    so children with `flex: 1` can grow (e.g. sidebar + content panes).
 *
 * Example:
 * ```html
 * <mj-page-header-interior Title="Users" Subtitle="...">
 *   <div toolbar>...</div>
 *   <div actions>...</div>
 * </mj-page-header-interior>
 * <mj-page-body-interior>
 *   <!-- content; scroll, padding, background all handled -->
 * </mj-page-body-interior>
 * ```
 *
 * See Section 10 of `plans/explorer-chrome-conventions.md` for the full
 * "interior chrome" contract.
 */
@Component({
  selector: 'mj-page-body-interior',
  standalone: true,
  template: `<ng-content></ng-content>`,
  styles: [`
    :host {
      display: block;
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
      padding: var(--mj-space-4);
      background: var(--mj-bg-page);
    }

    @media (min-width: 768px) {
      :host { padding: var(--mj-space-6); }
    }

    @media (min-width: 1024px) {
      :host { padding: var(--mj-space-8); }
    }

    /* No-padding escape hatch — for sub-pages whose inner content owns the gutter. */
    :host(.mj-page-body-interior--no-padding) {
      padding: 0;
    }

    /* Flex container mode — for sub-pages with sidebar + content layouts. */
    :host(.mj-page-body-interior--flex) {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    :host(.mj-page-body-interior--flex.mj-page-body-interior--row) {
      flex-direction: row;
    }
  `]
})
export class MJPageBodyInteriorComponent {
  /** When `false`, removes the responsive gutter. Defaults to `true`. */
  @Input() Padding: boolean = true;

  /**
   * When `true`, switches the body to a flex container so children with
   * `flex: 1` can fill remaining space (e.g. sidebar + content). Defaults to
   * `false` (block flow with vertical scroll).
   */
  @Input() Flex: boolean = false;

  /**
   * When `Flex=true`, controls flex direction. `'column'` (default) stacks
   * children vertically; `'row'` for left-rail + content sub-page layouts.
   * Ignored when `Flex=false`.
   */
  @Input() Direction: 'row' | 'column' = 'column';

  @HostBinding('class.mj-page-body-interior--no-padding')
  get NoPaddingClass(): boolean {
    return !this.Padding;
  }

  @HostBinding('class.mj-page-body-interior--flex')
  get FlexClass(): boolean {
    return this.Flex;
  }

  @HostBinding('class.mj-page-body-interior--row')
  get RowClass(): boolean {
    return this.Flex && this.Direction === 'row';
  }
}
