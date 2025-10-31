import { Component } from '@angular/core';
import { CampaignProductCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCampaignProductCategoryDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Campaign Product Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-campaignproductcategory-form',
    templateUrl: './campaignproductcategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CampaignProductCategoryFormComponent extends BaseFormComponent {
    public record!: CampaignProductCategoryEntity;
} 

export function LoadCampaignProductCategoryFormComponent() {
    LoadCampaignProductCategoryDetailsComponent();
}
