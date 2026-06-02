import { Component } from '@angular/core';
import { MJAIClientToolDefinitionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Client Tool Definitions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiclienttooldefinition-form',
    templateUrl: './mjaiclienttooldefinition.form.component.html'
})
export class MJAIClientToolDefinitionFormComponent extends BaseFormComponent {
    public record!: MJAIClientToolDefinitionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'toolDefinition', sectionName: 'Tool Definition', isExpanded: true },
            { sectionKey: 'executionConfiguration', sectionName: 'Execution Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentClientTools', sectionName: 'AI Agent Client Tools', isExpanded: false }
        ]);
    }
}

