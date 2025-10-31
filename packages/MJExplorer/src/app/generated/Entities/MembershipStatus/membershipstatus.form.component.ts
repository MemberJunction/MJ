import { Component } from '@angular/core';
import { MembershipStatusEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMembershipStatusDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Membership Status') // Tell MemberJunction about this class
@Component({
    selector: 'gen-membershipstatus-form',
    templateUrl: './membershipstatus.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MembershipStatusFormComponent extends BaseFormComponent {
    public record!: MembershipStatusEntity;
} 

export function LoadMembershipStatusFormComponent() {
    LoadMembershipStatusDetailsComponent();
}
