import { Component } from '@angular/core';
import { AIModelCostEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Model Costs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aimodelcost-form',
    templateUrl: './aimodelcost.form.component.html'
})
export class AIModelCostFormComponent extends BaseFormComponent {
    public record!: AIModelCostEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'modelProvider', sectionName: 'Model & Provider', isExpanded: true },
            { sectionKey: 'validityProcessing', sectionName: 'Validity & Processing', isExpanded: true },
            { sectionKey: 'pricingDetails', sectionName: 'Pricing Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadAIModelCostFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
