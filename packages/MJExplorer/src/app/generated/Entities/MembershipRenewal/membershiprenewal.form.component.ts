import { Component } from '@angular/core';
import { MembershipRenewalEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMembershipRenewalDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Membership Renewals') // Tell MemberJunction about this class
@Component({
    selector: 'gen-membershiprenewal-form',
    templateUrl: './membershiprenewal.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MembershipRenewalFormComponent extends BaseFormComponent {
    public record!: MembershipRenewalEntity;
} 

export function LoadMembershipRenewalFormComponent() {
    LoadMembershipRenewalDetailsComponent();
}
