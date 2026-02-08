import { Component } from '@angular/core';
import { AIPromptModelEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Prompt Models') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aipromptmodel-form',
    templateUrl: './aipromptmodel.form.component.html'
})
export class AIPromptModelFormComponent extends BaseFormComponent {
    public record!: AIPromptModelEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'promptModelMapping', sectionName: 'Prompt & Model Mapping', isExpanded: true },
            { sectionKey: 'vendorConfiguration', sectionName: 'Vendor & Configuration', isExpanded: true },
            { sectionKey: 'executionParallelSettings', sectionName: 'Execution & Parallel Settings', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAICredentialBindings', sectionName: 'MJ: AI Credential Bindings', isExpanded: false }
        ]);
    }
}

