import { Component, Input  } from '@angular/core';
import { SharedService } from '@memberjunction/ng-shared';
 
export class DrillDownInfo {
  public EntityName!: string;
  public Filter!: string;
  public BaseFilter: string = '';
  public get UserViewGridParams() {
    const fullFilter = this.BaseFilter?.length > 0 ? `(${this.Filter}) AND (${this.BaseFilter})` : this.Filter;
    return {
      EntityName: this.EntityName,
      ExtraFilter: fullFilter
    }
  }

  constructor(entityName: string, filter: string) {
    this.EntityName = entityName;
    this.Filter = filter;
  }
}

@Component({
  selector: 'mj-dynamic-report-drill-down',
  template: `
<kendo-tabstrip [keepTabContent]="true" [animate] = "false" mjFillContainer>
  <kendo-tabstrip-tab *ngFor="let dd of DrillDowns; let i = index" [selected]="i === activeTabIndex" >
    <ng-template kendoTabTitle>{{dd.Filter}}</ng-template>
    <ng-template kendoTabContent>
      <mj-user-view-grid [Params]="dd.UserViewGridParams" mjFillContainer> </mj-user-view-grid>
    </ng-template>
  </kendo-tabstrip-tab>
</kendo-tabstrip>
` 
})
export class DynamicReportDrillDownComponent  {
  @Input() public DrillDowns: DrillDownInfo[] = [];
  public activeTabIndex: number = 0;
  public SelectLastTab() {
    this.SelectTab(this.DrillDowns.length - 1);
  }
  public SelectFirstTab() {
    this.SelectTab(0);
  } 
  public SelectTab(index: number) { 
    if (index >=0 && index < this.DrillDowns.length) {
      if (this.activeTabIndex !== index) {
        this.activeTabIndex = index;
        SharedService.Instance.InvokeManualResize(100);
      }
    }
    else
      console.warn(`Invalid tab index: ${index}`);
  }
}