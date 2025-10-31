import { Component } from '@angular/core';
import { CaseReasonEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCaseReasonDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Case Reasons') // Tell MemberJunction about this class
@Component({
    selector: 'gen-casereason-form',
    templateUrl: './casereason.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CaseReasonFormComponent extends BaseFormComponent {
    public record!: CaseReasonEntity;
} 

export function LoadCaseReasonFormComponent() {
    LoadCaseReasonDetailsComponent();
}
