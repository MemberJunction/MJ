import { Component } from '@angular/core';
import { AIAgentTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aiagenttype-form',
    templateUrl: './aiagenttype.form.component.html'
})
export class AIAgentTypeFormComponent extends BaseFormComponent {
    public record!: AIAgentTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'basicDefinition', sectionName: 'Basic Definition', isExpanded: true },
            { sectionKey: 'promptConfiguration', sectionName: 'Prompt Configuration', isExpanded: true },
            { sectionKey: 'behaviorUISettings', sectionName: 'Behavior & UI Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'aIAgents', sectionName: 'AI Agents', isExpanded: false }
        ]);
    }
}

export function LoadAIAgentTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
