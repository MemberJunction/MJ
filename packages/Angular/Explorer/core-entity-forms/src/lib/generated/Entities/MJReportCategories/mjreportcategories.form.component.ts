import { Component } from '@angular/core';
import { MJReportCategoriesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Report Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjreportcategories-form',
    templateUrl: './mjreportcategories.form.component.html'
})
export class MJReportCategoriesFormComponent extends BaseFormComponent {
    public record!: MJReportCategoriesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryDetails', sectionName: 'Category Details', isExpanded: true },
            { sectionKey: 'hierarchy', sectionName: 'Hierarchy', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'reportCategories', sectionName: 'Report Categories', isExpanded: false },
            { sectionKey: 'reports', sectionName: 'Reports', isExpanded: false }
        ]);
    }
}

