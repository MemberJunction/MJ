import { Component } from '@angular/core';
import { CampaignCostTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCampaignCostTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Campaign Cost Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-campaigncosttype-form',
    templateUrl: './campaigncosttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CampaignCostTypeFormComponent extends BaseFormComponent {
    public record!: CampaignCostTypeEntity;
} 

export function LoadCampaignCostTypeFormComponent() {
    LoadCampaignCostTypeDetailsComponent();
}
