import { Component } from '@angular/core';
import { MJAIPromptModelEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Prompt Models') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaipromptmodel-form',
    templateUrl: './mjaipromptmodel.form.component.html'
})
export class MJAIPromptModelFormComponent extends BaseFormComponent {
    public record!: MJAIPromptModelEntity;

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

