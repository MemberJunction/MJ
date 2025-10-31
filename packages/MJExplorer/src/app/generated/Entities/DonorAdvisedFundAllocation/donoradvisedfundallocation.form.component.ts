import { Component } from '@angular/core';
import { DonorAdvisedFundAllocationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDonorAdvisedFundAllocationDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Donor Advised Fund Allocations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-donoradvisedfundallocation-form',
    templateUrl: './donoradvisedfundallocation.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DonorAdvisedFundAllocationFormComponent extends BaseFormComponent {
    public record!: DonorAdvisedFundAllocationEntity;
} 

export function LoadDonorAdvisedFundAllocationFormComponent() {
    LoadDonorAdvisedFundAllocationDetailsComponent();
}
