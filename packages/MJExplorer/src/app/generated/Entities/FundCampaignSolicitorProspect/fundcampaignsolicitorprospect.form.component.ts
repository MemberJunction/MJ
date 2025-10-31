import { Component } from '@angular/core';
import { FundCampaignSolicitorProspectEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadFundCampaignSolicitorProspectDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Fund Campaign Solicitor Prospects') // Tell MemberJunction about this class
@Component({
    selector: 'gen-fundcampaignsolicitorprospect-form',
    templateUrl: './fundcampaignsolicitorprospect.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class FundCampaignSolicitorProspectFormComponent extends BaseFormComponent {
    public record!: FundCampaignSolicitorProspectEntity;
} 

export function LoadFundCampaignSolicitorProspectFormComponent() {
    LoadFundCampaignSolicitorProspectDetailsComponent();
}
