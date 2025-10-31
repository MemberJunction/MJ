import { Component } from '@angular/core';
import { CaseReporterEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCaseReporterDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Case Reporters') // Tell MemberJunction about this class
@Component({
    selector: 'gen-casereporter-form',
    templateUrl: './casereporter.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CaseReporterFormComponent extends BaseFormComponent {
    public record!: CaseReporterEntity;
} 

export function LoadCaseReporterFormComponent() {
    LoadCaseReporterDetailsComponent();
}
