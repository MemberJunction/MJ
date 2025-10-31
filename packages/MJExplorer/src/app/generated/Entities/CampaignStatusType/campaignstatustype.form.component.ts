import { Component } from '@angular/core';
import { CampaignStatusTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCampaignStatusTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Campaign Status Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-campaignstatustype-form',
    templateUrl: './campaignstatustype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CampaignStatusTypeFormComponent extends BaseFormComponent {
    public record!: CampaignStatusTypeEntity;
} 

export function LoadCampaignStatusTypeFormComponent() {
    LoadCampaignStatusTypeDetailsComponent();
}
