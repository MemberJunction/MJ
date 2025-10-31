import { Component } from '@angular/core';
import { CampaignGLAccountEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCampaignGLAccountDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Campaign GL Accounts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-campaignglaccount-form',
    templateUrl: './campaignglaccount.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CampaignGLAccountFormComponent extends BaseFormComponent {
    public record!: CampaignGLAccountEntity;
} 

export function LoadCampaignGLAccountFormComponent() {
    LoadCampaignGLAccountDetailsComponent();
}
