import { Component } from '@angular/core';
import { MJAIAgentCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Agent Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaiagentcategory-form',
    templateUrl: './mjaiagentcategory.form.component.html'
})
export class MJAIAgentCategoryFormComponent extends BaseFormComponent {
    public record!: MJAIAgentCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryDefinition', sectionName: 'Category Definition', isExpanded: true },
            { sectionKey: 'hierarchy', sectionName: 'Hierarchy', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJAIAgentCategories', sectionName: 'AI Agent Categories', isExpanded: false },
            { sectionKey: 'mJAIAgents', sectionName: 'AI Agents', isExpanded: false }
        ]);
    }
}

