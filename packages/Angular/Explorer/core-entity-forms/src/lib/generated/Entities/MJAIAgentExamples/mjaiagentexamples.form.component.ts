import { Component } from '@angular/core';
import { MJAIAgentExamplesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Examples') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentexamples-form',
    templateUrl: './mjaiagentexamples.form.component.html'
})
export class MJAIAgentExamplesFormComponent extends BaseFormComponent {
    public record!: MJAIAgentExamplesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'ownershipScope', sectionName: 'Ownership & Scope', isExpanded: true },
            { sectionKey: 'exampleDetails', sectionName: 'Example Details', isExpanded: true },
            { sectionKey: 'sourceProvenance', sectionName: 'Source Provenance', isExpanded: false },
            { sectionKey: 'semanticIndexing', sectionName: 'Semantic Indexing', isExpanded: false },
            { sectionKey: 'usageLifecycle', sectionName: 'Usage & Lifecycle', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

