import { Component } from '@angular/core';
import { MJTemplateCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Template Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtemplatecategory-form',
    templateUrl: './mjtemplatecategory.form.component.html'
})
export class MJTemplateCategoryFormComponent extends BaseFormComponent {
    public record!: MJTemplateCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryInformation', sectionName: 'Category Information', isExpanded: true },
            { sectionKey: 'hierarchyStructure', sectionName: 'Hierarchy Structure', isExpanded: true },
            { sectionKey: 'managementAudit', sectionName: 'Management Audit', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTemplateCategories', sectionName: 'Template Categories', isExpanded: false },
            { sectionKey: 'mJTemplates', sectionName: 'Templates', isExpanded: false }
        ]);
    }
}

