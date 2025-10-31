import { Component } from '@angular/core';
import { CampaignActivityForecastEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCampaignActivityForecastDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Campaign Activity Forecasts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-campaignactivityforecast-form',
    templateUrl: './campaignactivityforecast.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CampaignActivityForecastFormComponent extends BaseFormComponent {
    public record!: CampaignActivityForecastEntity;
} 

export function LoadCampaignActivityForecastFormComponent() {
    LoadCampaignActivityForecastDetailsComponent();
}
