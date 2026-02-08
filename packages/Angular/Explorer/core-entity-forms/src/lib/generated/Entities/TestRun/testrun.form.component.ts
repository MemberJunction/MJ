import { Component } from '@angular/core';
import { TestRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Test Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-testrun-form',
    templateUrl: './testrun.form.component.html'
})
export class TestRunFormComponent extends BaseFormComponent {
    public record!: TestRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'testTargetInfo', sectionName: 'Test & Target Info', isExpanded: true },
            { sectionKey: 'runMetadata', sectionName: 'Run Metadata', isExpanded: false },
            { sectionKey: 'inputExpectedOutput', sectionName: 'Input & Expected Output', isExpanded: false },
            { sectionKey: 'resultAnalysis', sectionName: 'Result Analysis', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTestRunFeedbacks', sectionName: 'MJ: Test Run Feedbacks', isExpanded: false },
            { sectionKey: 'mJAIPromptRuns', sectionName: 'MJ: AI Prompt Runs', isExpanded: false },
            { sectionKey: 'mJAIAgentRuns', sectionName: 'MJ: AI Agent Runs', isExpanded: false },
            { sectionKey: 'conversations', sectionName: 'Conversations', isExpanded: false },
            { sectionKey: 'conversationDetails', sectionName: 'Conversation Details', isExpanded: false }
        ]);
    }
}

