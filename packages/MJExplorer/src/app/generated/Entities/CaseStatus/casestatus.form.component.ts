import { Component } from '@angular/core';
import { CaseStatusEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCaseStatusDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Case Status') // Tell MemberJunction about this class
@Component({
    selector: 'gen-casestatus-form',
    templateUrl: './casestatus.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CaseStatusFormComponent extends BaseFormComponent {
    public record!: CaseStatusEntity;
} 

export function LoadCaseStatusFormComponent() {
    LoadCaseStatusDetailsComponent();
}
