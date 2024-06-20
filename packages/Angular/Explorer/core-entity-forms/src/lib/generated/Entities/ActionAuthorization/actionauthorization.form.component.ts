import { Component } from '@angular/core';
import { ActionAuthorizationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadActionAuthorizationDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Action Authorizations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-actionauthorization-form',
    templateUrl: './actionauthorization.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActionAuthorizationFormComponent extends BaseFormComponent {
    public record!: ActionAuthorizationEntity;
} 

export function LoadActionAuthorizationFormComponent() {
    LoadActionAuthorizationDetailsComponent();
}
