import { Component } from '@angular/core';
import { CaseAssigneeDefaultEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCaseAssigneeDefaultDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Case Assignee Defaults') // Tell MemberJunction about this class
@Component({
    selector: 'gen-caseassigneedefault-form',
    templateUrl: './caseassigneedefault.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CaseAssigneeDefaultFormComponent extends BaseFormComponent {
    public record!: CaseAssigneeDefaultEntity;
} 

export function LoadCaseAssigneeDefaultFormComponent() {
    LoadCaseAssigneeDefaultDetailsComponent();
}
