import { Component } from '@angular/core';
import { AIAgentDataSourceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Data Sources') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-aiagentdatasource-form',
    templateUrl: './aiagentdatasource.form.component.html'
})
export class AIAgentDataSourceFormComponent extends BaseFormComponent {
    public record!: AIAgentDataSourceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'agentAssociation', sectionName: 'Agent Association', isExpanded: true },
            { sectionKey: 'sourceSpecification', sectionName: 'Source Specification', isExpanded: true },
            { sectionKey: 'retrievalMapping', sectionName: 'Retrieval & Mapping', isExpanded: false },
            { sectionKey: 'cachingStatus', sectionName: 'Caching & Status', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

