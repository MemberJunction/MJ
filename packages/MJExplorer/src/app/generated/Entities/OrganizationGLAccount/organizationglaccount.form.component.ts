import { Component } from '@angular/core';
import { OrganizationGLAccountEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrganizationGLAccountDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Organization GL Accounts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-organizationglaccount-form',
    templateUrl: './organizationglaccount.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrganizationGLAccountFormComponent extends BaseFormComponent {
    public record!: OrganizationGLAccountEntity;
} 

export function LoadOrganizationGLAccountFormComponent() {
    LoadOrganizationGLAccountDetailsComponent();
}
