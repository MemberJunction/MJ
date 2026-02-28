import { Component } from '@angular/core';
import { MJAIModelEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Models') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaimodel-form',
    templateUrl: './mjaimodel.form.component.html'
})
export class MJAIModelFormComponent extends BaseFormComponent {
    public record!: MJAIModelEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'modelOverview', sectionName: 'Model Overview', isExpanded: true },
            { sectionKey: 'performanceMetrics', sectionName: 'Performance Metrics', isExpanded: true },
            { sectionKey: 'technicalSpecifications', sectionName: 'Technical Specifications', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIActions', sectionName: 'AI Actions', isExpanded: false },
            { sectionKey: 'mJAIModelActions', sectionName: 'AI Model Actions', isExpanded: false },
            { sectionKey: 'mJEntityDocuments', sectionName: 'Entity Documents', isExpanded: false },
            { sectionKey: 'mJVectorIndexes', sectionName: 'Vector Indexes', isExpanded: false },
            { sectionKey: 'mJAIAgentExamples', sectionName: 'AI Agent Examples', isExpanded: false },
            { sectionKey: 'mJAIAgentNotes', sectionName: 'AI Agent Notes', isExpanded: false },
            { sectionKey: 'mJAIModelArchitectures', sectionName: 'AI Model Architectures', isExpanded: false },
            { sectionKey: 'mJAIModelModalities', sectionName: 'AI Model Modalities', isExpanded: false },
            { sectionKey: 'mJAIResultCache', sectionName: 'AI Result Cache', isExpanded: false },
            { sectionKey: 'mJContentTypes', sectionName: 'Content Types', isExpanded: false },
            { sectionKey: 'mJEntityAIActions', sectionName: 'Entity AI Actions', isExpanded: false },
            { sectionKey: 'mJAIAgentModels', sectionName: 'AIAgent Models', isExpanded: false },
            { sectionKey: 'mJAIModelVendors', sectionName: 'AI Model Vendors', isExpanded: false },
            { sectionKey: 'mJAIModelCosts', sectionName: 'AI Model Costs', isExpanded: false },
            { sectionKey: 'mJGeneratedCodes', sectionName: 'Generated Codes', isExpanded: false },
            { sectionKey: 'mJAIPromptModels', sectionName: 'AI Prompt Models', isExpanded: false },
            { sectionKey: 'mJAIPromptRuns', sectionName: 'AI Prompt Runs', isExpanded: false },
            { sectionKey: 'mJAIAgentRuns', sectionName: 'AI Agent Runs', isExpanded: false },
            { sectionKey: 'mJQueries', sectionName: 'Queries', isExpanded: false },
            { sectionKey: 'mJAIModels', sectionName: 'AI Models', isExpanded: false }
        ]);
    }
}

