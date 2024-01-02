import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-explorer-core';
import { ReportSnapshotEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Report Snapshots.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-reportsnapshot-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div *ngIf="this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Report ID</label>
            <kendo-numerictextbox [(value)]="record.ReportID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Result Set</label>
            <kendo-textbox [(ngModel)]="record.ResultSet"  />   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Created At</label>
            <span >{{FormatValue('CreatedAt', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">User ID</label>
            <kendo-numerictextbox [(value)]="record.UserID" ></kendo-numerictextbox>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">Report</label>
            <span >{{FormatValue('Report', 0)}}</span>   
        </div>               
        <div class="record-form-row">
            <label class="fieldLabel">User</label>
            <span >{{FormatValue('User', 0)}}</span>   
        </div> 
    </div>
    <div *ngIf="!this.EditMode" class="record-form">
                  
        <div class="record-form-row">
            <label class="fieldLabel">Report ID</label>
            <span mjFieldLink [record]="record" fieldName="ReportID" >{{FormatValue('ReportID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Result Set</label>
            <span >{{FormatValue('ResultSet', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Created At</label>
            <span >{{FormatValue('CreatedAt', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">User ID</label>
            <span mjFieldLink [record]="record" fieldName="UserID" >{{FormatValue('UserID', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">Report</label>
            <span >{{FormatValue('Report', 0)}}</span>
        </div>              
        <div class="record-form-row">
            <label class="fieldLabel">User</label>
            <span >{{FormatValue('User', 0)}}</span>
        </div>
    </div>
</div>
    `
})
export class ReportSnapshotDetailsComponent extends BaseFormSectionComponent {
    @Input() override record: ReportSnapshotEntity | null = null;
    @Input() override EditMode: boolean = false;
}

export function LoadReportSnapshotDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
