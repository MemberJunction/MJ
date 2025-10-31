import { Component } from '@angular/core';
import { CampaignCostEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCampaignCostDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Campaign Costs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-campaigncost-form',
    templateUrl: './campaigncost.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CampaignCostFormComponent extends BaseFormComponent {
    public record!: CampaignCostEntity;
} 

export function LoadCampaignCostFormComponent() {
    LoadCampaignCostDetailsComponent();
}
