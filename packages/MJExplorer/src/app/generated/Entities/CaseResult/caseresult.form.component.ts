import { Component } from '@angular/core';
import { CaseResultEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCaseResultDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Case Results') // Tell MemberJunction about this class
@Component({
    selector: 'gen-caseresult-form',
    templateUrl: './caseresult.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CaseResultFormComponent extends BaseFormComponent {
    public record!: CaseResultEntity;
} 

export function LoadCaseResultFormComponent() {
    LoadCaseResultDetailsComponent();
}
