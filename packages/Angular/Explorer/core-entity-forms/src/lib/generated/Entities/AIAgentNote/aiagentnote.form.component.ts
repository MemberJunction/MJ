import { Component } from '@angular/core';
import { AIAgentNoteEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'AI Agent Notes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aiagentnote-form',
    templateUrl: './aiagentnote.form.component.html'
})
export class AIAgentNoteFormComponent extends BaseFormComponent {
    public record!: AIAgentNoteEntity;

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

