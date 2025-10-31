import { Component } from '@angular/core';
import { PublicationRoleEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPublicationRoleDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Publication Roles') // Tell MemberJunction about this class
@Component({
    selector: 'gen-publicationrole-form',
    templateUrl: './publicationrole.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PublicationRoleFormComponent extends BaseFormComponent {
    public record!: PublicationRoleEntity;
} 

export function LoadPublicationRoleFormComponent() {
    LoadPublicationRoleDetailsComponent();
}
