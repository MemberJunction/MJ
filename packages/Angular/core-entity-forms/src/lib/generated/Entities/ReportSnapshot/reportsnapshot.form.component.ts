import { Component } from '@angular/core';
import { ReportSnapshotEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadReportSnapshotDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Report Snapshots') // Tell MemberJunction about this class
@Component({
    selector: 'gen-reportsnapshot-form',
    templateUrl: './reportsnapshot.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ReportSnapshotFormComponent extends BaseFormComponent {
    public record!: ReportSnapshotEntity;
} 

export function LoadReportSnapshotFormComponent() {
    LoadReportSnapshotDetailsComponent();
}
