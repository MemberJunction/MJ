import { Component } from '@angular/core';
import { MJAIAgentNoteTypesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Note Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentnotetypes-form',
    templateUrl: './mjaiagentnotetypes.form.component.html'
})
export class MJAIAgentNoteTypesFormComponent extends BaseFormComponent {
    public record!: MJAIAgentNoteTypesEntity;

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

