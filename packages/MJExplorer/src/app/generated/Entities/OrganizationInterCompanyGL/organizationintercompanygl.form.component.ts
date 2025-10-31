import { Component } from '@angular/core';
import { OrganizationInterCompanyGLEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrganizationInterCompanyGLDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Organization Inter Company GLs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-organizationintercompanygl-form',
    templateUrl: './organizationintercompanygl.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrganizationInterCompanyGLFormComponent extends BaseFormComponent {
    public record!: OrganizationInterCompanyGLEntity;
} 

export function LoadOrganizationInterCompanyGLFormComponent() {
    LoadOrganizationInterCompanyGLDetailsComponent();
}
