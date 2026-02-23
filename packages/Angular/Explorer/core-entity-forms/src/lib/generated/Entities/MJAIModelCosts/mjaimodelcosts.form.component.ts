import { Component } from '@angular/core';
import { MJAIModelCostsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Model Costs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaimodelcosts-form',
    templateUrl: './mjaimodelcosts.form.component.html'
})
export class MJAIModelCostsFormComponent extends BaseFormComponent {
    public record!: MJAIModelCostsEntity;

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

