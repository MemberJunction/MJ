import { Component, Input  } from '@angular/core';
import { SharedService } from '@memberjunction/ng-shared';
import { DrillDownInfo } from '@memberjunction/ng-skip-chat';
 

@Component({
  selector: 'mj-dynamic-report-drill-down',
  template: `
<kendo-tabstrip [keepTabContent]="true" [animate] = "false"  [closable]="true">
  <kendo-tabstrip-tab *ngFor="let dd of DrillDowns; let i = index" [selected]="i === activeTabIndex" closeIcon="delete">
    <ng-template kendoTabTitle>{{dd.Filter}}</ng-template>
    <ng-template kendoTabContent>
      <mj-user-view-grid [Params]="dd.UserViewGridParams" > </mj-user-view-grid>
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