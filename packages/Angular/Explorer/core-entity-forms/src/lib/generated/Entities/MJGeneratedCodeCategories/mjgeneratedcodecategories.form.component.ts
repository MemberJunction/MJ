import { Component } from '@angular/core';
import { MJGeneratedCodeCategoriesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Generated Code Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjgeneratedcodecategories-form',
    templateUrl: './mjgeneratedcodecategories.form.component.html'
})
export class MJGeneratedCodeCategoriesFormComponent extends BaseFormComponent {
    public record!: MJGeneratedCodeCategoriesEntity;

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

