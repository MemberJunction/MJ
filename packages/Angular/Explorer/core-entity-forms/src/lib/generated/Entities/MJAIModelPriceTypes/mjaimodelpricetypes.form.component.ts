import { Component } from '@angular/core';
import { MJAIModelPriceTypesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Model Price Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaimodelpricetypes-form',
    templateUrl: './mjaimodelpricetypes.form.component.html'
})
export class MJAIModelPriceTypesFormComponent extends BaseFormComponent {
    public record!: MJAIModelPriceTypesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'pricingMetricDetails', sectionName: 'Pricing Metric Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIModelCosts', sectionName: 'MJ: AI Model Costs', isExpanded: false }
        ]);
    }
}

