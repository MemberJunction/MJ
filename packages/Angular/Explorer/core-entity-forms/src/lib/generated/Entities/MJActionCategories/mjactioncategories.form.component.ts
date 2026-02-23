import { Component } from '@angular/core';
import { MJActionCategoriesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Action Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjactioncategories-form',
    templateUrl: './mjactioncategories.form.component.html'
})
export class MJActionCategoriesFormComponent extends BaseFormComponent {
    public record!: MJActionCategoriesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryDetails', sectionName: 'Category Details', isExpanded: true },
            { sectionKey: 'hierarchyInformation', sectionName: 'Hierarchy Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'actionCategories', sectionName: 'Action Categories', isExpanded: false },
            { sectionKey: 'actions', sectionName: 'Actions', isExpanded: false },
            { sectionKey: 'mJMCPServerTools', sectionName: 'MJ: MCP Server Tools', isExpanded: false }
        ]);
    }
}

