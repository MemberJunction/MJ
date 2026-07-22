import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, DashboardConfig } from '@memberjunction/ng-shared';
import { MJDashboardEntity, ResourceData } from '@memberjunction/core-entities';
import { ThemeStudioDashboardComponent } from './theme-studio-dashboard.component';

/**
 * Resource wrapper for the Theme Studio (org-theming Phase 5). Wraps
 * {@link ThemeStudioDashboardComponent} as a BaseResourceComponent so it can be
 * targeted by an application nav item with ResourceType "Custom" +
 * DriverClass "ThemeStudioResource" (see metadata/applications/.theme-studio-application.json).
 * Mirrors the Data Explorer resource wrapper.
 */
@RegisterClass(BaseResourceComponent, 'ThemeStudioResource')
@Component({
  standalone: false,
  selector: 'mj-theme-studio-resource',
  template: `
    <div class="theme-studio-resource-container">
      <mj-theme-studio-dashboard></mj-theme-studio-dashboard>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; height: 100%; }
    .theme-studio-resource-container { width: 100%; height: 100%; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeStudioResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  @ViewChild(ThemeStudioDashboardComponent) private dashboard!: ThemeStudioDashboardComponent;
  private _loaded = false;

  constructor(private cdr: ChangeDetectorRef) {
    super();
  }

  override set Data(value: ResourceData) {
    super.Data = value;
    if (!this._loaded) {
      this._loaded = true;
      this.wireDashboard();
    }
  }
  override get Data(): ResourceData {
    return super.Data;
  }

  ngOnInit(): void {
    super.ngOnInit();
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return data?.Name || 'Theme Studio';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-palette';
  }

  /** Wire the inner dashboard's load-complete signal up to the shell (with race guard). */
  private wireDashboard(): void {
    this.cdr.detectChanges();
    setTimeout(() => {
      if (!this.dashboard) {
        this.NotifyLoadComplete();
        return;
      }
      this.dashboard.LoadCompleteEvent = () => this.NotifyLoadComplete();
      this.dashboard.Config = { dashboard: null as unknown as MJDashboardEntity, userState: {} } as DashboardConfig;
      this.dashboard.Refresh();
      // Race guard: the dashboard may finish (microtask) before this macrotask attaches
      // the handler — forward completion if it already loaded (see DataExplorerResource).
      if (this.dashboard.LoadComplete) {
        this.NotifyLoadComplete();
      }
    }, 0);
  }
}
