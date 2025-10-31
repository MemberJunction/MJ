import { Component } from '@angular/core';
import { InternationalSupportFundEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadInternationalSupportFundDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'International Support Funds') // Tell MemberJunction about this class
@Component({
    selector: 'gen-internationalsupportfund-form',
    templateUrl: './internationalsupportfund.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class InternationalSupportFundFormComponent extends BaseFormComponent {
    public record!: InternationalSupportFundEntity;
} 

export function LoadInternationalSupportFundFormComponent() {
    LoadInternationalSupportFundDetailsComponent();
}
