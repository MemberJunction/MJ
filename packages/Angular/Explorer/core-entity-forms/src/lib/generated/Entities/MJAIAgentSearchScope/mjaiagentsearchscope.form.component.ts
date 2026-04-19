import { Component } from '@angular/core';
import { MJAIAgentSearchScopeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Search Scopes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentsearchscope-form',
    templateUrl: './mjaiagentsearchscope.form.component.html'
})
export class MJAIAgentSearchScopeFormComponent extends BaseFormComponent {
    public record!: MJAIAgentSearchScopeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'entityRelationships', sectionName: 'Entity Relationships', isExpanded: true },
            { sectionKey: 'executionControl', sectionName: 'Execution Control', isExpanded: true },
            { sectionKey: 'scheduling', sectionName: 'Scheduling', isExpanded: false },
            { sectionKey: 'searchConfiguration', sectionName: 'Search Configuration', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

