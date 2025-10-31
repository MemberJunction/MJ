import { Component } from '@angular/core';
import { CampaignDocStatusTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCampaignDocStatusTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Campaign Doc Status Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-campaigndocstatustype-form',
    templateUrl: './campaigndocstatustype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CampaignDocStatusTypeFormComponent extends BaseFormComponent {
    public record!: CampaignDocStatusTypeEntity;
} 

export function LoadCampaignDocStatusTypeFormComponent() {
    LoadCampaignDocStatusTypeDetailsComponent();
}
