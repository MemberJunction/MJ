import { Component } from '@angular/core';
import { CampaignImportFileColumnEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCampaignImportFileColumnDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Campaign Import File Columns') // Tell MemberJunction about this class
@Component({
    selector: 'gen-campaignimportfilecolumn-form',
    templateUrl: './campaignimportfilecolumn.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CampaignImportFileColumnFormComponent extends BaseFormComponent {
    public record!: CampaignImportFileColumnEntity;
} 

export function LoadCampaignImportFileColumnFormComponent() {
    LoadCampaignImportFileColumnDetailsComponent();
}
