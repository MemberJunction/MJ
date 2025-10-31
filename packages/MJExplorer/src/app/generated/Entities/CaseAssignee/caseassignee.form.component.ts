import { Component } from '@angular/core';
import { CaseAssigneeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCaseAssigneeDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Case Assignees') // Tell MemberJunction about this class
@Component({
    selector: 'gen-caseassignee-form',
    templateUrl: './caseassignee.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CaseAssigneeFormComponent extends BaseFormComponent {
    public record!: CaseAssigneeEntity;
} 

export function LoadCaseAssigneeFormComponent() {
    LoadCaseAssigneeDetailsComponent();
}
