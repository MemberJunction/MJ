import { Component } from '@angular/core';
import { AuthorizationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAuthorizationDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Authorizations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-authorization-form',
    templateUrl: './authorization.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AuthorizationFormComponent extends BaseFormComponent {
    public record!: AuthorizationEntity;
} 

export function LoadAuthorizationFormComponent() {
    LoadAuthorizationDetailsComponent();
}
