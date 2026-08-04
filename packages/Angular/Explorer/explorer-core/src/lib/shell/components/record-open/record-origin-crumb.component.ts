import { Component, Input, inject } from '@angular/core';
import { NavigationService, RecordSourceContext, RecordSourceHasReturnTarget } from '@memberjunction/ng-shared';

/**
 * Pane-level origin crumb — the FIRST element inside a record's golden-layout
 * pane (Matt's placement call, 2026-07-30: no record-chrome refactor; the
 * crumb rides the pane). One instance per record pane, which makes it correct
 * in every layout context the region-level bar could not be:
 * - split views: each pane carries its OWN origin
 * - docked records (main layout, bar or single-resource): provenance intact
 * - edit mode / custom form headers: unaffected — the crumb sits above the
 *   form entirely, in shell-owned territory
 * Rendered/positioned by the tab-container wherever record content attaches
 * (fresh loads, cache reattaches after promote/demote, single-resource).
 */
@Component({
  selector: 'mj-record-origin-crumb',
  standalone: true,
  // The crumb sits INSIDE a GL pane: without these stoppers, clicks bubble
  // to Golden Layout's pane-focus handlers, which re-activate the pane's
  // own tab and STOMP the navigation the click just started (the app
  // segment created the destination tab and then lost the activation race).
  host: {
    '(mousedown)': '$event.stopPropagation()',
    '(click)': '$event.stopPropagation()'
  },
  template: `
    @if (Origin) {
      @if (Clickable) {
        <i class="fa-solid fa-arrow-left crumb-lead" aria-hidden="true"></i>
        @if (Origin.sourceLabel) {
          <button type="button" class="crumb-seg" (click)="OnPageClick()" title="Back to where you opened this record">
            {{ Origin.sourceLabel }}
          </button>
        } @else {
          <button type="button" class="crumb-seg" (click)="OnAppClick()" [title]="'Go to ' + Origin.sourceAppName">
            {{ Origin.sourceAppName }}
          </button>
          @if (Origin.sourceNavLabel) {
            <span class="crumb-sep" aria-hidden="true">›</span>
            <button type="button" class="crumb-seg crumb-page" (click)="OnPageClick()" title="Back to where you opened this record">
              {{ Origin.sourceNavLabel }}
            </button>
          }
        }
      } @else {
        <!-- Provenance only — no return target (e.g. opened by an agent) -->
        <span class="origin-static">From {{ Origin.sourceLabel }}</span>
      }
    }
  `,
  styles: [`
    :host {
      display: flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
      height: 36px;
      /* Left indent deliberately DEEPER than the first tab's edge (~16px)
         so the crumb reads as a level BENEATH the tab — hierarchy, not a
         sibling bar. */
      padding: 0 12px 0 24px;
      /* Match the ACTIVE tab's surface so the tab flows into its pane
         (the sunken tone read as a disconnected band between them). */
      background: var(--mj-bg-surface);
      border-bottom: 1px solid var(--mj-border-default);
    }
    :host:not(:has(*)) { display: none; }
    .crumb-lead {
      font-size: 11px;
      color: var(--mj-text-muted);
      margin-right: 6px;
    }
    /* Each breadcrumb level is its OWN link with its own hover */
    .crumb-seg {
      display: inline-flex;
      align-items: center;
      max-width: 100%;
      padding: 5px 8px;
      border: none;
      border-radius: 4px;
      background: transparent;
      font-size: 12px;
      line-height: 1;
      font-family: inherit;
      color: var(--mj-text-secondary);
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .crumb-seg:hover {
      background: var(--mj-bg-surface-hover);
      color: var(--mj-text-primary);
    }
    .crumb-seg:focus-visible {
      outline: 2px solid var(--mj-border-focus);
      outline-offset: -2px;
    }
    .crumb-page { font-weight: 500; }
    .crumb-sep { color: var(--mj-text-muted); font-size: 12px; }
    .origin-static {
      padding: 5px 8px;
      font-size: 12px;
      color: var(--mj-text-muted);
    }
  `]
})
export class RecordOriginCrumbComponent {
  @Input() Origin: RecordSourceContext | null = null;

  private navigationService = inject(NavigationService);

  get Clickable(): boolean {
    return RecordSourceHasReturnTarget(this.Origin);
  }

  /** Page segment: full restore — the captured page, section state included */
  async OnPageClick(): Promise<void> {
    if (this.Origin) {
      await this.navigationService.ReturnToRecordSource(this.Origin);
    }
  }

  /** App segment: the app's LANDING page (breadcrumb level semantics) */
  async OnAppClick(): Promise<void> {
    if (this.Origin?.sourceAppId) {
      await this.navigationService.SwitchToAppHome(this.Origin.sourceAppId);
    }
  }
}
