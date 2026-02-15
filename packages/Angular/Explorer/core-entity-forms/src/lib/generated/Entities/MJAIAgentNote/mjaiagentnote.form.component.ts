import { Component } from '@angular/core';
import { MJAIAgentNoteEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Notes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentnote-form',
    templateUrl: './mjaiagentnote.form.component.html'
})
export class MJAIAgentNoteFormComponent extends BaseFormComponent {
    public record!: MJAIAgentNoteEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'scopeReferences', sectionName: 'Scope & References', isExpanded: true },
            { sectionKey: 'noteDetails', sectionName: 'Note Details', isExpanded: true },
            { sectionKey: 'embeddingAIData', sectionName: 'Embedding & AI Data', isExpanded: false },
            { sectionKey: 'usageLifecycle', sectionName: 'Usage & Lifecycle', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

