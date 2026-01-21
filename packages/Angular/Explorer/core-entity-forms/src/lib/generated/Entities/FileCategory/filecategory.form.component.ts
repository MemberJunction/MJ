import { Component } from '@angular/core';
import { FileCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'File Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-filecategory-form',
    templateUrl: './filecategory.form.component.html'
})
export class FileCategoryFormComponent extends BaseFormComponent {
    public record!: FileCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'hierarchyIdentifiers', sectionName: 'Hierarchy Identifiers', isExpanded: true },
            { sectionKey: 'categoryInformation', sectionName: 'Category Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'fileCategories', sectionName: 'File Categories', isExpanded: false },
            { sectionKey: 'files', sectionName: 'Files', isExpanded: false }
        ]);
    }
}

export function LoadFileCategoryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
