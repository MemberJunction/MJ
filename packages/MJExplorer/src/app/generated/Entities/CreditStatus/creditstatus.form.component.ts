import { Component } from '@angular/core';
import { CreditStatusEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCreditStatusDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Credit Status') // Tell MemberJunction about this class
@Component({
    selector: 'gen-creditstatus-form',
    templateUrl: './creditstatus.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CreditStatusFormComponent extends BaseFormComponent {
    public record!: CreditStatusEntity;
} 

export function LoadCreditStatusFormComponent() {
    LoadCreditStatusDetailsComponent();
}
