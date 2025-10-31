import { Component } from '@angular/core';
import { GrantDisbursementEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadGrantDisbursementDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Grant Disbursements') // Tell MemberJunction about this class
@Component({
    selector: 'gen-grantdisbursement-form',
    templateUrl: './grantdisbursement.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class GrantDisbursementFormComponent extends BaseFormComponent {
    public record!: GrantDisbursementEntity;
} 

export function LoadGrantDisbursementFormComponent() {
    LoadGrantDisbursementDetailsComponent();
}
