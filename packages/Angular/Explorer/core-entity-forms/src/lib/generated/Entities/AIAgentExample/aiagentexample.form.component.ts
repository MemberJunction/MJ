import { Component } from '@angular/core';
import { AIAgentExampleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Examples') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aiagentexample-form',
    templateUrl: './aiagentexample.form.component.html'
})
export class AIAgentExampleFormComponent extends BaseFormComponent {
    public record!: AIAgentExampleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'ownershipScope', sectionName: 'Ownership & Scope', isExpanded: true },
            { sectionKey: 'exampleDetails', sectionName: 'Example Details', isExpanded: true },
            { sectionKey: 'sourceProvenance', sectionName: 'Source Provenance', isExpanded: false },
            { sectionKey: 'semanticIndexing', sectionName: 'Semantic Indexing', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadAIAgentExampleFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
