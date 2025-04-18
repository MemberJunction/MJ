import { Component } from '@angular/core';
import { OrganizationLinkEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadOrganizationLinkDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Organization Links') // Tell MemberJunction about this class
@Component({
    selector: 'gen-organizationlink-form',
    templateUrl: './organizationlink.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class OrganizationLinkFormComponent extends BaseFormComponent {
    public record!: OrganizationLinkEntity;
} 

export function LoadOrganizationLinkFormComponent() {
    LoadOrganizationLinkDetailsComponent();
}