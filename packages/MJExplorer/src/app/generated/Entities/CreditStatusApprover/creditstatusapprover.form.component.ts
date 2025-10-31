import { Component } from '@angular/core';
import { CreditStatusApproverEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCreditStatusApproverDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Credit Status Approvers') // Tell MemberJunction about this class
@Component({
    selector: 'gen-creditstatusapprover-form',
    templateUrl: './creditstatusapprover.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CreditStatusApproverFormComponent extends BaseFormComponent {
    public record!: CreditStatusApproverEntity;
} 

export function LoadCreditStatusApproverFormComponent() {
    LoadCreditStatusApproverDetailsComponent();
}
