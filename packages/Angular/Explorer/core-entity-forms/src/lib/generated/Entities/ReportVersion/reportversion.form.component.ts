import { Component } from '@angular/core';
import { ReportVersionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadReportVersionDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: Report Versions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-reportversion-form',
    templateUrl: './reportversion.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ReportVersionFormComponent extends BaseFormComponent {
    public record!: ReportVersionEntity;
} 

export function LoadReportVersionFormComponent() {
    LoadReportVersionDetailsComponent();
}
