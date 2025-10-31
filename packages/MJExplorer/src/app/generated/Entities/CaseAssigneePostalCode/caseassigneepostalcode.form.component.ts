import { Component } from '@angular/core';
import { CaseAssigneePostalCodeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCaseAssigneePostalCodeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Case Assignee Postal Codes') // Tell MemberJunction about this class
@Component({
    selector: 'gen-caseassigneepostalcode-form',
    templateUrl: './caseassigneepostalcode.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CaseAssigneePostalCodeFormComponent extends BaseFormComponent {
    public record!: CaseAssigneePostalCodeEntity;
} 

export function LoadCaseAssigneePostalCodeFormComponent() {
    LoadCaseAssigneePostalCodeDetailsComponent();
}
