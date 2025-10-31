import { Component } from '@angular/core';
import { FundCampaignSolicitorEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadFundCampaignSolicitorDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Fund Campaign Solicitors') // Tell MemberJunction about this class
@Component({
    selector: 'gen-fundcampaignsolicitor-form',
    templateUrl: './fundcampaignsolicitor.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class FundCampaignSolicitorFormComponent extends BaseFormComponent {
    public record!: FundCampaignSolicitorEntity;
} 

export function LoadFundCampaignSolicitorFormComponent() {
    LoadFundCampaignSolicitorDetailsComponent();
}
