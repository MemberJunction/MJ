import { Component } from '@angular/core';
import { OrganizationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrganizationDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Organizations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-organization-form',
    templateUrl: './organization.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrganizationFormComponent extends BaseFormComponent {
    public record!: OrganizationEntity;
} 

export function LoadOrganizationFormComponent() {
    LoadOrganizationDetailsComponent();
}
