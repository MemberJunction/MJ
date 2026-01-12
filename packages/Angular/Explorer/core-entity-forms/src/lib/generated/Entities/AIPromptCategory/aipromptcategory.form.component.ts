import { Component } from '@angular/core';
import { AIPromptCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'AI Prompt Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-aipromptcategory-form',
    templateUrl: './aipromptcategory.form.component.html'
})
export class AIPromptCategoryFormComponent extends BaseFormComponent {
    public record!: AIPromptCategoryEntity;

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

export function LoadAIPromptCategoryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
