import { Component } from '@angular/core';
import { MJTemplateCategoriesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Template Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtemplatecategories-form',
    templateUrl: './mjtemplatecategories.form.component.html'
})
export class MJTemplateCategoriesFormComponent extends BaseFormComponent {
    public record!: MJTemplateCategoriesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryInformation', sectionName: 'Category Information', isExpanded: true },
            { sectionKey: 'hierarchyStructure', sectionName: 'Hierarchy Structure', isExpanded: true },
            { sectionKey: 'managementAudit', sectionName: 'Management Audit', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'templateCategories', sectionName: 'Template Categories', isExpanded: false },
            { sectionKey: 'templates', sectionName: 'Templates', isExpanded: false }
        ]);
    }
}

