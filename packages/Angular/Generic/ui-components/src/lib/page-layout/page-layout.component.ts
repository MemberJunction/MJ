import { Component } from '@angular/core';

/**
 * mj-page-layout — Canonical outer shell for MJ Explorer dashboards/resource pages.
 *
 * Provides the standard flex-column / full-height / page-background container.
 * Place a `<mj-page-header>` and the page body inside.
 *
 * Example:
 * ```html
 * <mj-page-layout>
 *   <mj-page-header Title="Agents" Icon="fa-solid fa-robot">...</mj-page-header>
 *   <!-- page content -->
 * </mj-page-layout>
 * ```
 */
@Component({
  selector: 'mj-page-layout',
  standalone: true,
  template: `<ng-content></ng-content>`,
  styles: [`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--mj-bg-page);
      overflow: hidden;
    }
  `]
})
export class MJPageLayoutComponent {}
