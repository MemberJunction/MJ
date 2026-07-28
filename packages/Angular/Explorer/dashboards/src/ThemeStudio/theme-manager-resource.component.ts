import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CompositeKey } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, DashboardConfig } from '@memberjunction/ng-shared';
import { MJDashboardEntity, ResourceData } from '@memberjunction/core-entities';
import { ThemeManagerDashboardComponent } from './theme-manager-dashboard.component';

/**
 * Resource wrapper for the Theme Manager (org-theming Phase 5). Targeted by the
 * "Manage Themes" application nav item (ResourceType "Custom", DriverClass
 * "ThemeManagerResource"). Forwards the inner dashboard's OpenEntityRecord to the
 * shell so "Edit" opens the theme record. Mirrors the Theme Studio resource wrapper.
 */
@RegisterClass(BaseResourceComponent, 'ThemeManagerResource')
@Component({
  standalone: false,
  selector: 'mj-theme-manager-resource',
  template: `
    <div class="theme-manager-resource-container">
      <mj-theme-manager-dashboard (OpenEntityRecord)="onOpenEntityRecord($event)"></mj-theme-manager-dashboard>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; height: 100%; }
    .theme-manager-resource-container { width: 100%; height: 100%; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeManagerResourceComponent extends BaseResourceComponent implements OnInit, OnDestroy {
  @ViewChild(ThemeManagerDashboardComponent) private dashboard!: ThemeManagerDashboardComponent;
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
    return data?.Name || 'Manage Themes';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-swatchbook';
  }

  public onOpenEntityRecord(event: { EntityName: string; RecordPKey: CompositeKey }): void {
    if (event?.EntityName && event.RecordPKey) {
      this.navigationService.OpenEntityRecord(event.EntityName, event.RecordPKey);
    }
  }

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
      if (this.dashboard.LoadComplete) {
        this.NotifyLoadComplete();
      }
    }, 0);
  }
}
