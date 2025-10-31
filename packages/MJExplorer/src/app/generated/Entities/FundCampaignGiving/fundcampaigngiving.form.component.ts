import { Component } from '@angular/core';
import { FundCampaignGivingEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadFundCampaignGivingDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Fund Campaign Givings') // Tell MemberJunction about this class
@Component({
    selector: 'gen-fundcampaigngiving-form',
    templateUrl: './fundcampaigngiving.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class FundCampaignGivingFormComponent extends BaseFormComponent {
    public record!: FundCampaignGivingEntity;
} 

export function LoadFundCampaignGivingFormComponent() {
    LoadFundCampaignGivingDetailsComponent();
}
