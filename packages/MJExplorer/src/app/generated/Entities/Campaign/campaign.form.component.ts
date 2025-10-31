import { Component } from '@angular/core';
import { CampaignEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCampaignDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Campaigns') // Tell MemberJunction about this class
@Component({
    selector: 'gen-campaign-form',
    templateUrl: './campaign.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CampaignFormComponent extends BaseFormComponent {
    public record!: CampaignEntity;
} 

export function LoadCampaignFormComponent() {
    LoadCampaignDetailsComponent();
}
