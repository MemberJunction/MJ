import { Component } from '@angular/core';
import { client_membershipEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { Loadclient_membershipDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'client _memberships') // Tell MemberJunction about this class
@Component({
    selector: 'gen-client_membership-form',
    templateUrl: './client_membership.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class client_membershipFormComponent extends BaseFormComponent {
    public record!: client_membershipEntity;
} 

export function Loadclient_membershipFormComponent() {
    Loadclient_membershipDetailsComponent();
}
