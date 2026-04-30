import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { MJResourceTypeEntity, ViewInfo} from '@memberjunction/core-entities';
import { ResourceData } from '@memberjunction/core-entities';
import { SharedService } from '@memberjunction/ng-shared';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
@Component({
  standalone: false,
  selector: 'app-add-item-dialog',
  templateUrl: './add-item.component.html',
  styleUrls: ['./add-item.component.css']
})
export class AddItemComponent extends BaseAngularComponent implements OnInit {
  @Output() onClose = new EventEmitter<any>();
  @Input() selectedResource!:MJResourceTypeEntity | null;
  public showloader: boolean = false;
  public resourceType: any = null;
  public selectedEntity: any = null;
  public selectedView: any = null;
  public selectedReport: any = null;
  public selectedViewMode: string = 'grid';
  public viewModeOptions = [
    { label: 'Grid', value: 'grid', icon: 'fa-solid fa-list' },
    { label: 'Cards', value: 'cards', icon: 'fa-solid fa-grip' },
    { label: 'Timeline', value: 'timeline', icon: 'fa-solid fa-timeline' },
    { label: 'Map', value: 'map', icon: 'fa-solid fa-map' }
  ];
  public Entities: any[] = [];
  public Views: any[] = [];
  public Reports: any[] = [];
  public get ResourceTypes(): any[] {
    return SharedService.Instance.ResourceTypes.filter((rt: any) => rt.Name !== 'Dashboards' && rt.Name !== 'Records');
  }
  private get md() { return this.ProviderToUse; }
  constructor(private sharedService: SharedService) {
    super(); }

  ngOnInit(): void {
    this.resourceType = this.selectedResource || SharedService.Instance.ViewResourceType;
    this.onResourceTypeChange(this.resourceType);
    // Sort entities alphabetically by name
    this.Entities = [...this.md.Entities].sort((a, b) => 
      a.Name.localeCompare(b.Name)
    );
  }

  async onResourceTypeChange(event: any) {
    this.resourceType = event;
    this.selectedEntity = null;
    if (this.resourceType.Name === 'Reports') {
      this.getReports();
    }
  }

  async getViews() {
    if (!this.selectedEntity) return;
    
    this.showloader = true;
    this.Views = await ViewInfo.GetViewsForUser(this.selectedEntity.ID);
    
    // Sort views alphabetically
    if (this.Views && this.Views.length) {
      this.Views = this.Views.sort((a, b) => a.Name.localeCompare(b.Name));
    }
    
    // Always set showloader to false when done, even if no views found
    this.showloader = false;
  }

  async getReports() {
    if (!this.resourceType) return;
    
    this.showloader = true;
    this.selectedReport = null;
    this.Reports = [];
    
    const rv = RunView.FromMetadataProvider(this.ProviderToUse);
    const reports = await rv.RunView({ EntityName: this.resourceType.Entity, ExtraFilter: `UserID='${this.md.CurrentUser.ID}'` });
    
    if (reports.Success && reports.Results) {
      // Sort reports alphabetically
      this.Reports = reports.Results.sort((a, b) => a.Name.localeCompare(b.Name));
    }
    
    // Always set showloader to false when done, even if no reports found
    this.showloader = false;
  }

  onEntityChange(event: any) {
    this.selectedEntity = event;
    this.selectedView = null;
    this.selectedReport = null;
    this.getViews();
  }

  onViewChange(event: any) {
    if (this.resourceType.Name === 'Reports') {
      this.selectedReport = event;
    } else {
      this.selectedView = event;
    }
  }

  public addItem() {
    // For views, allow "Default View" (no specific view selected) when an entity is chosen
    const isViewResource = this.resourceType?.Name === 'UserViews' || this.resourceType?.Entity === 'MJ: User Views';
    const isDefaultView = isViewResource && this.selectedEntity && !this.selectedView;

    if (!this.selectedReport && !this.selectedView && !isDefaultView) {
      this.sharedService.CreateSimpleNotification('Please select an item to add', 'warning', 2000);
      return;
    }

    const name = this.selectedReport?.Name || this.selectedView?.Name || (isDefaultView ? `${this.selectedEntity.Name} (Default View)` : null);
    const id = this.selectedReport?.ID || this.selectedView?.ID || null;

    // Build configuration — include viewMode for view resources
    const configuration: Record<string, unknown> = {};
    if (isViewResource && this.selectedViewMode && this.selectedViewMode !== 'grid') {
      configuration['viewMode'] = this.selectedViewMode;
    }
    if (isDefaultView && this.selectedEntity) {
      configuration['Entity'] = this.selectedEntity.Name;
    }

    const dashboardItem = {
      title: name ? name : 'New Item',
      col: 1,
      rowSpan: 3,
      colSpan: 2,
      ResourceData: new ResourceData({
        Name: name,
        ResourceType: this.resourceType.Name,
        ResourceTypeID: this.resourceType.ID,
        ResourceRecordID: id,
        Configuration: configuration
      }),
    };

    this.sharedService.CreateSimpleNotification(`Added "${name}" to dashboard`, 'success', 2000);
    this.onClose.emit(dashboardItem);
  }

  closeDialog() {
    this.onClose.emit();
  }
}
