import { Component } from '@angular/core';
import { CampaignDocumentTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCampaignDocumentTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Campaign Document Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-campaigndocumenttype-form',
    templateUrl: './campaigndocumenttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CampaignDocumentTypeFormComponent extends BaseFormComponent {
    public record!: CampaignDocumentTypeEntity;
} 

export function LoadCampaignDocumentTypeFormComponent() {
    LoadCampaignDocumentTypeDetailsComponent();
}
