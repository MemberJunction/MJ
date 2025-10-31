import { Component } from '@angular/core';
import { FundCampaignEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadFundCampaignDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Fund Campaigns') // Tell MemberJunction about this class
@Component({
    selector: 'gen-fundcampaign-form',
    templateUrl: './fundcampaign.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class FundCampaignFormComponent extends BaseFormComponent {
    public record!: FundCampaignEntity;
} 

export function LoadFundCampaignFormComponent() {
    LoadFundCampaignDetailsComponent();
}
