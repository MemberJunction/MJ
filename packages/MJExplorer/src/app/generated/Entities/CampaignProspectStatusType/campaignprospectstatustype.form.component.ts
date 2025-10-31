import { Component } from '@angular/core';
import { CampaignProspectStatusTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCampaignProspectStatusTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Campaign Prospect Status Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-campaignprospectstatustype-form',
    templateUrl: './campaignprospectstatustype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CampaignProspectStatusTypeFormComponent extends BaseFormComponent {
    public record!: CampaignProspectStatusTypeEntity;
} 

export function LoadCampaignProspectStatusTypeFormComponent() {
    LoadCampaignProspectStatusTypeDetailsComponent();
}
