import { Component } from '@angular/core';
import { MJFileCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: File Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjfilecategory-form',
    templateUrl: './mjfilecategory.form.component.html'
})
export class MJFileCategoryFormComponent extends BaseFormComponent {
    public record!: MJFileCategoryEntity;

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

