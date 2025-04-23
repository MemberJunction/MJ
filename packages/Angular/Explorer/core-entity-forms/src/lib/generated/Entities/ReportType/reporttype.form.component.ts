import { Component } from '@angular/core';
import { ReportTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadReportTypeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: Report Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-reporttype-form',
    templateUrl: './reporttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ReportTypeFormComponent extends BaseFormComponent {
    public record!: ReportTypeEntity;
} 

export function LoadReportTypeFormComponent() {
    LoadReportTypeDetailsComponent();
}
