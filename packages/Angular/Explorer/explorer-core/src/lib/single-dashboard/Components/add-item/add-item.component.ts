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
  @Output() OnClose = new EventEmitter<any>();

  /**
   * @deprecated Use {@link OnClose}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (onClose) keeps working. Must stay AFTER OnClose: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() onClose = this.OnClose;
  @Input() SelectedResource!:MJResourceTypeEntity | null;

  /** @deprecated Use {@link SelectedResource}. */
  @Input() set selectedResource(value: MJResourceTypeEntity | null) {
    this.SelectedResource = value;
  }
  /** @deprecated Use {@link SelectedResource}. */
  get selectedResource(): MJResourceTypeEntity | null {
    return this.SelectedResource;
  }
  public Showloader: boolean = false;

  /** @deprecated Use {@link Showloader}. */
  public get showloader(): boolean {
    return this.Showloader;
  }
  /** @deprecated Use {@link Showloader}. */
  public set showloader(value: boolean) {
    this.Showloader = value;
  }
  public ResourceType: any = null;

  /** @deprecated Use {@link ResourceType}. */
  public get resourceType(): any {
    return this.ResourceType;
  }
  /** @deprecated Use {@link ResourceType}. */
  public set resourceType(value: any) {
    this.ResourceType = value;
  }
  public SelectedEntity: any = null;

  /** @deprecated Use {@link SelectedEntity}. */
  public get selectedEntity(): any {
    return this.SelectedEntity;
  }
  /** @deprecated Use {@link SelectedEntity}. */
  public set selectedEntity(value: any) {
    this.SelectedEntity = value;
  }
  public SelectedView: any = null;

  /** @deprecated Use {@link SelectedView}. */
  public get selectedView(): any {
    return this.SelectedView;
  }
  /** @deprecated Use {@link SelectedView}. */
  public set selectedView(value: any) {
    this.SelectedView = value;
  }
  public SelectedViewMode: string = 'grid';

  /** @deprecated Use {@link SelectedViewMode}. */
  public get selectedViewMode(): string {
    return this.SelectedViewMode;
  }
  /** @deprecated Use {@link SelectedViewMode}. */
  public set selectedViewMode(value: string) {
    this.SelectedViewMode = value;
  }
  public ViewModeOptions = [
    { label: 'Grid', value: 'grid', icon: 'fa-solid fa-list' },
    { label: 'Cards', value: 'cards', icon: 'fa-solid fa-grip' },
    { label: 'Timeline', value: 'timeline', icon: 'fa-solid fa-timeline' },
    { label: 'Map', value: 'map', icon: 'fa-solid fa-map' }
  ];

  /** @deprecated Use {@link ViewModeOptions}. */
  public get viewModeOptions() {
    return this.ViewModeOptions;
  }
  /** @deprecated Use {@link ViewModeOptions}. */
  public set viewModeOptions(value) {
    this.ViewModeOptions = value;
  }
  public Entities: any[] = [];
  public Views: any[] = [];
  public get ResourceTypes(): any[] {
    return SharedService.Instance.ResourceTypes.filter((rt: any) => rt.Name !== 'Dashboards' && rt.Name !== 'Records');
  }
  private get md() { return this.ProviderToUse; }
  constructor(private sharedService: SharedService) {
    super(); }

  ngOnInit(): void {
    this.ResourceType = this.SelectedResource || SharedService.Instance.ViewResourceType;
    this.OnResourceTypeChange(this.ResourceType);
    // Sort entities alphabetically by name
    this.Entities = [...this.md.Entities].sort((a, b) => 
      a.Name.localeCompare(b.Name)
    );
  }

  async OnResourceTypeChange(event: any) {
    this.ResourceType = event;
    this.SelectedEntity = null;
  }

  /** @deprecated Use {@link OnResourceTypeChange}. */
  async onResourceTypeChange(event: any) {
    return this.OnResourceTypeChange(event);
  }

  async GetViews() {
    if (!this.SelectedEntity) return;
    
    this.Showloader = true;
    this.Views = await ViewInfo.GetViewsForUser(this.SelectedEntity.ID);
    
    // Sort views alphabetically
    if (this.Views && this.Views.length) {
      this.Views = this.Views.sort((a, b) => a.Name.localeCompare(b.Name));
    }
    
    // Always set showloader to false when done, even if no views found
    this.Showloader = false;
  }

  /** @deprecated Use {@link GetViews}. */
  async getViews() {
    return this.GetViews();
  }

  OnEntityChange(event: any) {
    this.SelectedEntity = event;
    this.SelectedView = null;
    this.GetViews();
  }

  /** @deprecated Use {@link OnEntityChange}. */
  onEntityChange(event: any) {
    return this.OnEntityChange(event);
  }

  OnViewChange(event: any) {
    this.SelectedView = event;
  }

  /** @deprecated Use {@link OnViewChange}. */
  onViewChange(event: any) {
    return this.OnViewChange(event);
  }

  public AddItem() {
    // For views, allow "Default View" (no specific view selected) when an entity is chosen
    const isViewResource = this.ResourceType?.Name === 'UserViews' || this.ResourceType?.Entity === 'MJ: User Views';
    const isDefaultView = isViewResource && this.SelectedEntity && !this.SelectedView;

    if (!this.SelectedView && !isDefaultView) {
      this.sharedService.CreateSimpleNotification('Please select an item to add', 'warning', 2000);
      return;
    }

    const name = this.SelectedView?.Name || (isDefaultView ? `${this.SelectedEntity.Name} (Default View)` : null);
    const id = this.SelectedView?.ID || null;

    // Build configuration — include viewMode for view resources
    const configuration: Record<string, unknown> = {};
    if (isViewResource && this.SelectedViewMode && this.SelectedViewMode !== 'grid') {
      configuration['viewMode'] = this.SelectedViewMode;
    }
    if (isDefaultView && this.SelectedEntity) {
      configuration['Entity'] = this.SelectedEntity.Name;
    }

    const dashboardItem = {
      title: name ? name : 'New Item',
      col: 1,
      rowSpan: 3,
      colSpan: 2,
      ResourceData: new ResourceData({
        Name: name,
        ResourceType: this.ResourceType.Name,
        ResourceTypeID: this.ResourceType.ID,
        ResourceRecordID: id,
        Configuration: configuration
      }),
    };

    this.sharedService.CreateSimpleNotification(`Added "${name}" to dashboard`, 'success', 2000);
    this.OnClose.emit(dashboardItem);
  }

  /** @deprecated Use {@link AddItem}. */
  public addItem() {
    return this.AddItem();
  }

  CloseDialog() {
    this.OnClose.emit();
  }

  /** @deprecated Use {@link CloseDialog}. */
  closeDialog() {
    return this.CloseDialog();
  }
}
