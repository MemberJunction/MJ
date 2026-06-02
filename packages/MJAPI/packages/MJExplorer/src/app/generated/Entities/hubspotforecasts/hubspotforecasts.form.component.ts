import { Component } from '@angular/core';
import { hubspotforecastsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Forecasts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotforecasts-form',
    templateUrl: './hubspotforecasts.form.component.html'
})
export class hubspotforecastsFormComponent extends BaseFormComponent {
    public record!: hubspotforecastsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'forecastDetails', sectionName: 'Forecast Details', isExpanded: true },
            { sectionKey: 'financials', sectionName: 'Financials', isExpanded: true },
            { sectionKey: 'relationships', sectionName: 'Relationships', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

