import { Component } from '@angular/core';
import { CampaignProductEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCampaignProductDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Campaign Products') // Tell MemberJunction about this class
@Component({
    selector: 'gen-campaignproduct-form',
    templateUrl: './campaignproduct.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CampaignProductFormComponent extends BaseFormComponent {
    public record!: CampaignProductEntity;
} 

export function LoadCampaignProductFormComponent() {
    LoadCampaignProductDetailsComponent();
}
