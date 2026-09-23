import { Component } from '@angular/core';
import { MJAIUsageTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Usage Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiusagetype-form',
    templateUrl: './mjaiusagetype.form.component.html'
})
export class MJAIUsageTypeFormComponent extends BaseFormComponent {
    public record!: MJAIUsageTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJAIModelPriceUnitTypes', sectionName: 'AI Model Price Unit Types', isExpanded: false },
            { sectionKey: 'mJAIPromptRuns', sectionName: 'AI Prompt Runs', isExpanded: false }
        ]);
    }
}

