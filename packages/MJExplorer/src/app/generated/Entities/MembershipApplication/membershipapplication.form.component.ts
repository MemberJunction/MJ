import { Component } from '@angular/core';
import { MembershipApplicationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMembershipApplicationDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Membership Applications') // Tell MemberJunction about this class
@Component({
    selector: 'gen-membershipapplication-form',
    templateUrl: './membershipapplication.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MembershipApplicationFormComponent extends BaseFormComponent {
    public record!: MembershipApplicationEntity;
} 

export function LoadMembershipApplicationFormComponent() {
    LoadMembershipApplicationDetailsComponent();
}
