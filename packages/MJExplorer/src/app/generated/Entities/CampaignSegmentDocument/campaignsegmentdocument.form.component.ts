import { Component } from '@angular/core';
import { CampaignSegmentDocumentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCampaignSegmentDocumentDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Campaign Segment Documents') // Tell MemberJunction about this class
@Component({
    selector: 'gen-campaignsegmentdocument-form',
    templateUrl: './campaignsegmentdocument.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CampaignSegmentDocumentFormComponent extends BaseFormComponent {
    public record!: CampaignSegmentDocumentEntity;
} 

export function LoadCampaignSegmentDocumentFormComponent() {
    LoadCampaignSegmentDocumentDetailsComponent();
}
