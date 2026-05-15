import { Component, Input } from '@angular/core';
import { MJPageLayoutComponent } from '../page-layout/page-layout.component';
import { MJPageHeaderComponent } from '../page-header/page-header.component';
import { MJPageBodyComponent } from '../page-body/page-body.component';

/**
 * mj-page-frame — Composite chrome wrapper that bundles `<mj-page-layout>` +
 * `<mj-page-header>` + `<mj-page-body>` plus the `HideToolbar` gating pattern
 * that "inner" components inside tab-parent shells repeat verbatim.
 *
 * **Use this when** you're building an "inner" component for a tab-parent
 * shell (Scheduling jobs/overview/activity inside the Scheduling dashboard,
 * Testing runs/explorer/analytics inside the Testing dashboard, etc.) — the
 * parent shell will pass `[HideToolbar]="true"` when it embeds this
 * component, and `[HideToolbar]="false"` (or omit it) when it's accessed
 * standalone via deep link.
 *
 * **Use the lower-level trio** (`<mj-page-layout>` + `<mj-page-header>` +
 * `<mj-page-body>`) instead when:
 * - You need to gate the header, layout, or body independently
 * - You're building a Section 9a/9b exception page that doesn't fit the
 *   uniform chrome pattern
 *
 * ## Slot model
 *
 * Same as `<mj-page-header>` — `[meta]`, `[actions]`, `[toolbar]` selectors
 * project into the header's three slots. Everything else (no attribute)
 * lands in the body region.
 *
 * ## Behavior under HideToolbar
 *
 * When `HideToolbar=true`, only the default-slot (body) content renders.
 * The `[meta]`, `[actions]`, `[toolbar]` slot content is still matched by
 * the projection map (so it doesn't leak into the body's catch-all
 * `<ng-content>`), but the chrome itself is suppressed. The parent shell
 * handles all chrome in that mode.
 *
 * ## Example
 *
 * ```html
 * <mj-page-frame
 *   Title="Scheduled Jobs"
 *   Icon="fa-solid fa-calendar-check"
 *   Subtitle="Configure and manage scheduled jobs"
 *   [HideToolbar]="HideToolbar">
 *
 *   <div meta>
 *     <mj-stat-badge [Count]="FilteredJobs.length" [Total]="Jobs.length" Label="jobs" />
 *   </div>
 *   <div actions>
 *     <mj-refresh-button (Clicked)="Refresh()" />
 *     <button mjButton variant="primary" size="sm" (click)="OpenCreateSlideout()">
 *       <i class="fa-solid fa-plus"></i> New Job
 *     </button>
 *   </div>
 *   <div toolbar>
 *     <mj-page-search
 *       Placeholder="Search jobs..."
 *       [Value]="SearchTerm"
 *       (ValueChange)="OnSearchChange($event)" />
 *   </div>
 *
 *   <!-- Body content (everything not in a named slot) -->
 *   <div class="jobs-container">
 *     ...
 *   </div>
 * </mj-page-frame>
 * ```
 *
 * Compare to the pre-composite pattern, which required a 30-line
 * `@if (HideToolbar) { ngTemplateOutlet } @else { mj-page-layout > ... }`
 * block plus a `<ng-template #content>` to avoid duplicating the body —
 * documented in plans/explorer-chrome-conventions.md Section 5.
 */
@Component({
  selector: 'mj-page-frame',
  standalone: true,
  imports: [MJPageLayoutComponent, MJPageHeaderComponent, MJPageBodyComponent],
  template: `
    @if (HideToolbar) {
      <ng-content></ng-content>
    } @else {
      <mj-page-layout>
        <mj-page-header
          [Title]="Title"
          [Icon]="Icon"
          [Subtitle]="Subtitle">
          <ng-content select="[meta]"></ng-content>
          <ng-content select="[actions]"></ng-content>
          <ng-content select="[toolbar]"></ng-content>
        </mj-page-header>
        <mj-page-body [Padding]="Padding" [Flex]="Flex">
          <ng-content></ng-content>
        </mj-page-body>
      </mj-page-layout>
    }
  `
})
export class MJPageFrameComponent {
  /** Page title. Required for the header path; ignored when HideToolbar=true. */
  @Input() Title: string = '';

  /**
   * Optional Font Awesome icon class for the header's icon tile.
   * Pass null/empty to hide the icon block entirely.
   */
  @Input() Icon: string | null = null;

  /** Optional subtitle text below the title. */
  @Input() Subtitle: string | null = null;

  /**
   * When true, render only the projected default-slot (body) content —
   * no page-layout, no page-header, no page-body. Used when a parent
   * tab-parent shell embeds this inner component and owns its own chrome.
   *
   * The slot-attributed content (`[meta]`, `[actions]`, `[toolbar]`) is
   * still matched by the projection map in this mode, so it gets
   * suppressed cleanly instead of leaking into the body's catch-all.
   */
  @Input() HideToolbar: boolean = false;

  /**
   * Forwarded to `<mj-page-body>`. When false, removes the body's 24px gutter
   * — use for pages that own their own padding (e.g. sidebar+content layouts).
   */
  @Input() Padding: boolean = true;

  /**
   * Forwarded to `<mj-page-body>`. When true, the body becomes
   * `flex; flex-direction: column; position: relative` so a child marked
   * `flex: 1` can fill the remaining vertical space.
   */
  @Input() Flex: boolean = false;
}
