import { Component } from '@angular/core';
import { DonorAdvisedFundEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDonorAdvisedFundDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Donor Advised Funds') // Tell MemberJunction about this class
@Component({
    selector: 'gen-donoradvisedfund-form',
    templateUrl: './donoradvisedfund.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DonorAdvisedFundFormComponent extends BaseFormComponent {
    public record!: DonorAdvisedFundEntity;
} 

export function LoadDonorAdvisedFundFormComponent() {
    LoadDonorAdvisedFundDetailsComponent();
}
