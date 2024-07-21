import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { ResourceTypeEntity, ViewInfo} from '@memberjunction/core-entities';
import { ResourceData } from '@memberjunction/ng-shared';
import { SharedService } from '@memberjunction/ng-shared';

@Component({
  selector: 'app-add-item-dialog',
  templateUrl: './add-item.component.html',
  styleUrls: ['./add-item.component.css']
})
export class AddItemComponent implements OnInit {
  @Output() onClose = new EventEmitter<any>();
  @Input() selectedResource!:ResourceTypeEntity | null;
  public showloader: boolean = false;
  public resourceType: any = null;
  public selectedEntity: any = null;
  public selectedView: any = null;
  public selectedReport: any = null;
  public Entities: any[] = [];
  public Views: any[] = [];
  public Reports: any[] = [];
  public get ResourceTypes(): any[] {
    return SharedService.Instance.ResourceTypes.filter((rt: any) => rt.Name !== 'Dashboards' && rt.Name !== 'Records');
  }
  private md: Metadata = new Metadata();

  constructor() { }

  ngOnInit(): void {
    this.resourceType = this.selectedResource || SharedService.Instance.ViewResourceType;
    this.onResourceTypeChange(this.resourceType);
    this.Entities = this.md.Entities;
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
    this.showloader = false;
  }

  async getReports() {
    if (!this.resourceType) return;
    this.showloader = true;
    this.selectedReport = null;
    const rv = new RunView();
    const reports = await rv.RunView({ EntityName: this.resourceType.Entity, ExtraFilter: `UserID='${this.md.CurrentUser.ID}'` });
    if (reports.Success) {
      this.Reports = reports.Results;
    }
    this.showloader = false;
  }

  onEntityChange(event: any) {
    this.selectedEntity = event;
    this.selectedView = null;
    this.selectedReport = null;
    this.getViews();
  }

  onViewChange(event: any) {
    this.selectedEntity = event.ID;
  }

  public addItem() {
    if (!this.selectedReport && !this.selectedView) return;
    const name = this.selectedReport?.Name || this.selectedView?.Name;
    const id = this.selectedReport?.ID || this.selectedView?.ID;
    const dashboardItem = {
      title: name ? name : 'New Item - ' + id,
      col: 1,
      rowSpan: 3,
      colSpan: 2,
      ResourceData: new ResourceData({
        Name: '',
        ResourceTypeID: this.resourceType.ID,
        ResourceRecordID: id,
        Configuration: {
        }
      }),
    };
    this.onClose.emit(dashboardItem);

  }

  closeDialog() {
    this.onClose.emit();
  }
}
