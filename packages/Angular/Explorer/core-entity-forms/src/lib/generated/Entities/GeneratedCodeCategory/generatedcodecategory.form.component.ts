import { Component } from '@angular/core';
import { GeneratedCodeCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Generated Code Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-generatedcodecategory-form',
    templateUrl: './generatedcodecategory.form.component.html'
})
export class GeneratedCodeCategoryFormComponent extends BaseFormComponent {
    public record!: GeneratedCodeCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryInformation', sectionName: 'Category Information', isExpanded: true },
            { sectionKey: 'hierarchyRelationships', sectionName: 'Hierarchy Relationships', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'generatedCodeCategories', sectionName: 'Generated Code Categories', isExpanded: false },
            { sectionKey: 'generatedCodes', sectionName: 'Generated Codes', isExpanded: false }
        ]);
    }
}

export function LoadGeneratedCodeCategoryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
