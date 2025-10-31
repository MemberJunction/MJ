import { Component } from '@angular/core';
import { CampaignListDetailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCampaignListDetailDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Campaign List Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-campaignlistdetail-form',
    templateUrl: './campaignlistdetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CampaignListDetailFormComponent extends BaseFormComponent {
    public record!: CampaignListDetailEntity;
} 

export function LoadCampaignListDetailFormComponent() {
    LoadCampaignListDetailDetailsComponent();
}
