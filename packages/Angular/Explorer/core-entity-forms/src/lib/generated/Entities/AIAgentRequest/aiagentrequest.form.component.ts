import { Component } from '@angular/core';
import { AIAgentRequestEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'AI Agent Requests') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aiagentrequest-form',
    templateUrl: './aiagentrequest.form.component.html'
})
export class AIAgentRequestFormComponent extends BaseFormComponent {
    public record!: AIAgentRequestEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'requestSummary', sectionName: 'Request Summary', isExpanded: true },
            { sectionKey: 'responseSummary', sectionName: 'Response Summary', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadAIAgentRequestFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
