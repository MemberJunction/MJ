import { Component, ElementRef, EventEmitter, Input, Output, inject } from '@angular/core';
import { MJDashboardEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { HOME_OVERVIEW_TAB_ID, IsHomeOverviewTab, NextHomeTabFocusIndex } from './home-dashboard-tabs.helpers';

/**
 * Segmented control on Home: Overview, one tab per Home dashboard, and Add. Presentational.
 * The arrow keys, Home and End move focus between the tabs; Enter or Space selects the focused tab.
 */
@Component({
  standalone: false,
  selector: 'mj-home-dashboard-tabs',
  template: `
    <div class="ht">
      <div class="ht-tabs" role="tablist" aria-label="Home views" (keydown)="OnTabsKeydown($event)">
        <button type="button" role="tab" class="ht-tab" [class.on]="IsOverviewActive"
          [attr.aria-selected]="IsOverviewActive ? 'true' : 'false'" [attr.tabindex]="IsOverviewActive ? 0 : -1"
          (click)="ActiveIdChange.emit(OverviewId)"><i class="fa-solid fa-house" aria-hidden="true"></i> Overview</button>
        @for (d of Tabs; track d.ID) {
          <button type="button" role="tab" class="ht-tab" [class.on]="IsActive(d)" [attr.title]="d.Name"
            [attr.aria-selected]="IsActive(d) ? 'true' : 'false'" [attr.tabindex]="IsActive(d) ? 0 : -1"
            (click)="ActiveIdChange.emit(d.ID)"><i class="fa-solid fa-gauge-high" aria-hidden="true"></i> <span class="ht-name">{{ d.Name }}</span></button>
        }
      </div>
      <button type="button" class="ht-add" (click)="AddRequested.emit()" aria-label="Add a Home dashboard"><i class="fa-solid fa-plus" aria-hidden="true"></i> Add</button>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .ht { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; max-width: 100%; padding: 4px; background: var(--mj-bg-surface-sunken); border-radius: var(--mj-radius-lg); }
    .ht-tabs { display: inline-flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
    .ht-tab, .ht-add { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 14px; border-radius: var(--mj-radius-md); border: 1px solid transparent; background: transparent; color: var(--mj-text-secondary); font: inherit; font-size: 13px; font-weight: var(--mj-font-semibold); cursor: pointer; }
    .ht-tab:hover, .ht-add:hover { background: var(--mj-bg-surface); }
    .ht-tab:focus-visible, .ht-add:focus-visible { outline: var(--mj-ring-width) solid var(--mj-focus-ring-color); outline-offset: var(--mj-ring-offset); }
    .ht-tab.on { background: var(--mj-bg-surface); color: var(--mj-brand-primary); border-color: var(--mj-border-default); box-shadow: var(--mj-shadow-sm); }
    .ht-name { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `],
})
export class HomeDashboardTabsComponent {
  /** The Home tab dashboards, in tab order. */
  @Input() Tabs: MJDashboardEntity[] = [];
  /** The active tab: 'overview' or a dashboard ID. */
  @Input() ActiveId = HOME_OVERVIEW_TAB_ID;
  /** Emits the tab the user clicks: 'overview' or a dashboard ID. */
  @Output() ActiveIdChange = new EventEmitter<string>();
  /** Emits when the user clicks Add. */
  @Output() AddRequested = new EventEmitter<void>();

  public readonly OverviewId = HOME_OVERVIEW_TAB_ID;

  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** True when Overview is selected: ActiveId is Overview or names no tab in the list. */
  public get IsOverviewActive(): boolean {
    return IsHomeOverviewTab(this.ActiveId) || !this.Tabs.some(d => this.IsActive(d));
  }

  public IsActive(d: MJDashboardEntity): boolean {
    return UUIDsEqual(this.ActiveId, d.ID);
  }

  /** Moves focus to another tab for the arrow keys, Home and End. Other keys keep their default. */
  public OnTabsKeydown(event: KeyboardEvent): void {
    const tabs = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[role="tab"]'));
    const next = NextHomeTabFocusIndex(event.key, tabs.indexOf(event.target as HTMLElement), tabs.length);
    if (next === null) {
      return;
    }
    event.preventDefault();
    tabs[next].focus();
  }
}
