import { Component, Input } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormSectionComponent } from '@memberjunction/ng-base-forms';
import { ReportSnapshotEntity } from '@memberjunction/core-entities';

@RegisterClass(BaseFormSectionComponent, 'Report Snapshots.details') // Tell MemberJunction about this class 
@Component({
    selector: 'gen-reportsnapshot-form-details',
    styleUrls: ['../../../../../shared/form-styles.css'],
    template: `<div *ngIf="this.record">
    <div class="record-form">
        <mj-form-field 
    [record]="record"
    FieldName="ReportID"
    Type="numerictextbox"
    [EditMode]="EditMode"
            LinkType="Record"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="ResultSet"
    Type="textbox"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="CreatedAt"
    Type="textbox"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="UserID"
    Type="numerictextbox"
    [EditMode]="EditMode"
            LinkType="Record"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="Report"
    Type="textbox"
    [EditMode]="EditMode"
></mj-form-field>
        <mj-form-field 
    [record]="record"
    FieldName="User"
    Type="textbox"
    [EditMode]="EditMode"
></mj-form-field>

    </div>
</div>
    `
})
export class ReportSnapshotDetailsComponent extends BaseFormSectionComponent {
    @Input() override record!: ReportSnapshotEntity;
    @Input() override EditMode: boolean = false;
}

export function LoadReportSnapshotDetailsComponent() {
    // does nothing, but called in order to prevent tree-shaking from eliminating this component from the build
}
      