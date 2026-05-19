import { Component, Input } from '@angular/core';

/**
 * mj-page-header — Canonical page/dashboard header for MJ Explorer.
 *
 * Renders the standard icon · title · subtitle layout with three named projection
 * slots for additional content:
 *   - `[meta]`    — inline content immediately after the title text (result counts,
 *                   status badges) — wraps onto the title's row so it stays
 *                   horizontally adjacent to the title regardless of subtitle.
 *   - `[actions]` — right-aligned action buttons or sub-navigation
 *   - `[toolbar]` — optional secondary row beneath the title for dense controls
 *                   (filters, time-range pickers, breadcrumbs)
 *
 * Example:
 * ```html
 * <mj-page-header Title="Dashboard" Icon="fa-solid fa-gauge" Subtitle="Overview">
 *   <span meta class="badge">{{ count }}</span>
 *   <div actions>
 *     <button mjButton variant="primary">New</button>
 *   </div>
 *   <div toolbar>
 *     <app-time-range-picker></app-time-range-picker>
 *     <app-filter-bar></app-filter-bar>
 *   </div>
 * </mj-page-header>
 * ```
 *
 * For the body-level interior chrome variant used by left-nav sub-pages, use
 * `<mj-page-header-interior>` instead — same slot conventions, different
 * visual shape (single-row card, no titlebar).
 */
@Component({
  selector: 'mj-page-header',
  standalone: true,
  styleUrls: ['./page-header.scss'],
  template: `
    <header class="mj-page-header">
      <div class="mj-page-header-row mj-page-header-row--primary">
        <div class="mj-page-header-titlebar">
          @if (Icon) {
            <div class="mj-page-header-icon" aria-hidden="true">
              <i [class]="Icon"></i>
            </div>
          }
          <div class="mj-page-header-text">
            <div class="mj-page-header-title-row">
              <h1 class="mj-page-header-title">{{ Title }}</h1>
              <div class="mj-page-header-meta">
                <ng-content select="[meta]"></ng-content>
              </div>
            </div>
            @if (Subtitle) {
              <p class="mj-page-header-subtitle">{{ Subtitle }}</p>
            }
          </div>
        </div>
        <div class="mj-page-header-actions">
          <ng-content select="[actions]"></ng-content>
        </div>
      </div>
      <div class="mj-page-header-row mj-page-header-row--toolbar">
        <ng-content select="[toolbar]"></ng-content>
      </div>
    </header>
  `
})
export class MJPageHeaderComponent {
  @Input() Title: string = '';
  @Input() Icon: string | null = null;
  @Input() Subtitle: string | null = null;
}
