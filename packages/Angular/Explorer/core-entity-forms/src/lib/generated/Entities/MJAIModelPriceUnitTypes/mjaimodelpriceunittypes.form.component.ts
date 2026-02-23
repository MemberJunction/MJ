import { Component } from '@angular/core';
import { MJAIModelPriceUnitTypesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Model Price Unit Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaimodelpriceunittypes-form',
    templateUrl: './mjaimodelpriceunittypes.form.component.html'
})
export class MJAIModelPriceUnitTypesFormComponent extends BaseFormComponent {
    public record!: MJAIModelPriceUnitTypesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'unitDefinition', sectionName: 'Unit Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIModelCosts', sectionName: 'MJ: AI Model Costs', isExpanded: false }
        ]);
    }
}

