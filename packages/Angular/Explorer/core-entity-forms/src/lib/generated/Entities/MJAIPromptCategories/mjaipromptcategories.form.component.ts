import { Component } from '@angular/core';
import { MJAIPromptCategoriesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: AI Prompt Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjaipromptcategories-form',
    templateUrl: './mjaipromptcategories.form.component.html'
})
export class MJAIPromptCategoriesFormComponent extends BaseFormComponent {
    public record!: MJAIPromptCategoriesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryIdentification', sectionName: 'Category Identification', isExpanded: true },
            { sectionKey: 'hierarchyStructure', sectionName: 'Hierarchy Structure', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'aIPrompts', sectionName: 'AI Prompts', isExpanded: false },
            { sectionKey: 'aIPromptCategories', sectionName: 'AI Prompt Categories', isExpanded: false }
        ]);
    }
}

