import { Component } from '@angular/core';
import { CampaignTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCampaignTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Campaign Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-campaigntype-form',
    templateUrl: './campaigntype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CampaignTypeFormComponent extends BaseFormComponent {
    public record!: CampaignTypeEntity;
} 

export function LoadCampaignTypeFormComponent() {
    LoadCampaignTypeDetailsComponent();
}
