import { Component } from '@angular/core';
import { MJAIModelsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Models') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaimodels-form',
    templateUrl: './mjaimodels.form.component.html'
})
export class MJAIModelsFormComponent extends BaseFormComponent {
    public record!: MJAIModelsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'modelOverview', sectionName: 'Model Overview', isExpanded: true },
            { sectionKey: 'performanceMetrics', sectionName: 'Performance Metrics', isExpanded: true },
            { sectionKey: 'technicalSpecifications', sectionName: 'Technical Specifications', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'aIActions', sectionName: 'AI Actions', isExpanded: false },
            { sectionKey: 'aIModelActions', sectionName: 'AI Model Actions', isExpanded: false },
            { sectionKey: 'entityDocuments', sectionName: 'Entity Documents', isExpanded: false },
            { sectionKey: 'vectorIndexes', sectionName: 'Vector Indexes', isExpanded: false },
            { sectionKey: 'mJAIAgentExamples', sectionName: 'MJ: AI Agent Examples', isExpanded: false },
            { sectionKey: 'aIAgentNotes', sectionName: 'AI Agent Notes', isExpanded: false },
            { sectionKey: 'mJAIModelArchitectures', sectionName: 'MJ: AI Model Architectures', isExpanded: false },
            { sectionKey: 'mJAIModelModalities', sectionName: 'MJ: AI Model Modalities', isExpanded: false },
            { sectionKey: 'aIResultCache', sectionName: 'AI Result Cache', isExpanded: false },
            { sectionKey: 'contentTypes', sectionName: 'Content Types', isExpanded: false },
            { sectionKey: 'entityAIActions', sectionName: 'Entity AI Actions', isExpanded: false },
            { sectionKey: 'aIAgentModels', sectionName: 'AIAgent Models', isExpanded: false },
            { sectionKey: 'mJAIModelVendors', sectionName: 'MJ: AI Model Vendors', isExpanded: false },
            { sectionKey: 'mJAIModelCosts', sectionName: 'MJ: AI Model Costs', isExpanded: false },
            { sectionKey: 'generatedCodes', sectionName: 'Generated Codes', isExpanded: false },
            { sectionKey: 'mJAIPromptModels', sectionName: 'MJ: AI Prompt Models', isExpanded: false },
            { sectionKey: 'mJAIPromptRuns', sectionName: 'MJ: AI Prompt Runs', isExpanded: false },
            { sectionKey: 'mJAIAgentRuns', sectionName: 'MJ: AI Agent Runs', isExpanded: false },
            { sectionKey: 'queries', sectionName: 'Queries', isExpanded: false },
            { sectionKey: 'aIModels', sectionName: 'AI Models', isExpanded: false }
        ]);
    }
}

