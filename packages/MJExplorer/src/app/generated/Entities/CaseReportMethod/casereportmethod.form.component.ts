import { Component } from '@angular/core';
import { CaseReportMethodEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCaseReportMethodDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Case Report Methods') // Tell MemberJunction about this class
@Component({
    selector: 'gen-casereportmethod-form',
    templateUrl: './casereportmethod.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CaseReportMethodFormComponent extends BaseFormComponent {
    public record!: CaseReportMethodEntity;
} 

export function LoadCaseReportMethodFormComponent() {
    LoadCaseReportMethodDetailsComponent();
}
