import { Component } from '@angular/core';
import { CaseIssueEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCaseIssueDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Case Issues') // Tell MemberJunction about this class
@Component({
    selector: 'gen-caseissue-form',
    templateUrl: './caseissue.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CaseIssueFormComponent extends BaseFormComponent {
    public record!: CaseIssueEntity;
} 

export function LoadCaseIssueFormComponent() {
    LoadCaseIssueDetailsComponent();
}
