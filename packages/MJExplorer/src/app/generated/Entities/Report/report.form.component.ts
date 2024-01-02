import { Component } from '@angular/core';
import { ReportEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadReportDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Reports') // Tell MemberJunction about this class
@Component({
    selector: 'gen-report-form',
    templateUrl: './report.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ReportFormComponent extends BaseFormComponent {
    public record: ReportEntity | null = null;
} 

export function LoadReportFormComponent() {
    LoadReportDetailsComponent();
}
