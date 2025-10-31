import { Component } from '@angular/core';
import { CampaignSegmentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCampaignSegmentDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Campaign Segments') // Tell MemberJunction about this class
@Component({
    selector: 'gen-campaignsegment-form',
    templateUrl: './campaignsegment.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CampaignSegmentFormComponent extends BaseFormComponent {
    public record!: CampaignSegmentEntity;
} 

export function LoadCampaignSegmentFormComponent() {
    LoadCampaignSegmentDetailsComponent();
}
