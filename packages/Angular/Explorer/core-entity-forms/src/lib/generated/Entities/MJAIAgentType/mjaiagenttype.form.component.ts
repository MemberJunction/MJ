import { Component } from '@angular/core';
import { MJAIAgentTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagenttype-form',
    templateUrl: './mjaiagenttype.form.component.html'
})
export class MJAIAgentTypeFormComponent extends BaseFormComponent {
    public record!: MJAIAgentTypeEntity;

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

