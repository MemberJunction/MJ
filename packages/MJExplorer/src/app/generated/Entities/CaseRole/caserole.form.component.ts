import { Component } from '@angular/core';
import { CaseRoleEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCaseRoleDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Case Roles') // Tell MemberJunction about this class
@Component({
    selector: 'gen-caserole-form',
    templateUrl: './caserole.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CaseRoleFormComponent extends BaseFormComponent {
    public record!: CaseRoleEntity;
} 

export function LoadCaseRoleFormComponent() {
    LoadCaseRoleDetailsComponent();
}
