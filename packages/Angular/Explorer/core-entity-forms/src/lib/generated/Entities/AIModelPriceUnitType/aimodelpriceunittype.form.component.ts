import { Component } from '@angular/core';
import { AIModelPriceUnitTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Model Price Unit Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aimodelpriceunittype-form',
    templateUrl: './aimodelpriceunittype.form.component.html'
})
export class AIModelPriceUnitTypeFormComponent extends BaseFormComponent {
    public record!: AIModelPriceUnitTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'unitDefinition', sectionName: 'Unit Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIModelCosts', sectionName: 'MJ: AI Model Costs', isExpanded: false }
        ]);
    }
}

export function LoadAIModelPriceUnitTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
