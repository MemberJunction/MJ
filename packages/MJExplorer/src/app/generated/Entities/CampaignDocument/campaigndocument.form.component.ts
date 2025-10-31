import { Component } from '@angular/core';
import { CampaignDocumentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCampaignDocumentDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Campaign Documents') // Tell MemberJunction about this class
@Component({
    selector: 'gen-campaigndocument-form',
    templateUrl: './campaigndocument.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CampaignDocumentFormComponent extends BaseFormComponent {
    public record!: CampaignDocumentEntity;
} 

export function LoadCampaignDocumentFormComponent() {
    LoadCampaignDocumentDetailsComponent();
}
