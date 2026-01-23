import { Component } from '@angular/core';
import { AIAgentNoteTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'AI Agent Note Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentnotetype-form',
    templateUrl: './aiagentnotetype.form.component.html'
})
export class AIAgentNoteTypeFormComponent extends BaseFormComponent {
    public record!: AIAgentNoteTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifier', sectionName: 'Identifier', isExpanded: true },
            { sectionKey: 'noteTypeDefinition', sectionName: 'Note Type Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'aIAgentNotes', sectionName: 'AIAgent Notes', isExpanded: false }
        ]);
    }
}

export function LoadAIAgentNoteTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
