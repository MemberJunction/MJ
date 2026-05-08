import { Component, Input } from '@angular/core';

/**
 * mj-page-header — Canonical page/dashboard header for MJ Explorer.
 *
 * Renders the standard icon · title · subtitle layout with three named projection
 * slots for additional content:
 *   - `[meta]`    — small inline content next to the title (filter toggles, counts)
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
            <h1 class="mj-page-header-title">{{ Title }}</h1>
            @if (Subtitle) {
              <p class="mj-page-header-subtitle">{{ Subtitle }}</p>
            }
          </div>
          <div class="mj-page-header-meta">
            <ng-content select="[meta]"></ng-content>
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
