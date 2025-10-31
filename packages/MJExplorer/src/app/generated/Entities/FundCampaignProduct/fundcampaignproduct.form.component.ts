import { Component } from '@angular/core';
import { FundCampaignProductEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadFundCampaignProductDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Fund Campaign Products') // Tell MemberJunction about this class
@Component({
    selector: 'gen-fundcampaignproduct-form',
    templateUrl: './fundcampaignproduct.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class FundCampaignProductFormComponent extends BaseFormComponent {
    public record!: FundCampaignProductEntity;
} 

export function LoadFundCampaignProductFormComponent() {
    LoadFundCampaignProductDetailsComponent();
}
