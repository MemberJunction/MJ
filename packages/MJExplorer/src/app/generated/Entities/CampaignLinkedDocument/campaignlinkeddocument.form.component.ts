import { Component } from '@angular/core';
import { CampaignLinkedDocumentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCampaignLinkedDocumentDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Campaign Linked Documents') // Tell MemberJunction about this class
@Component({
    selector: 'gen-campaignlinkeddocument-form',
    templateUrl: './campaignlinkeddocument.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CampaignLinkedDocumentFormComponent extends BaseFormComponent {
    public record!: CampaignLinkedDocumentEntity;
} 

export function LoadCampaignLinkedDocumentFormComponent() {
    LoadCampaignLinkedDocumentDetailsComponent();
}
