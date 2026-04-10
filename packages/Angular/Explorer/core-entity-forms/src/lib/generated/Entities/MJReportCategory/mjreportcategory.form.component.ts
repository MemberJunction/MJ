import { Component } from '@angular/core';
import { MJReportCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Report Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjreportcategory-form',
    templateUrl: './mjreportcategory.form.component.html'
})
export class MJReportCategoryFormComponent extends BaseFormComponent {
    public record!: MJReportCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryDetails', sectionName: 'Category Details', isExpanded: true },
            { sectionKey: 'hierarchy', sectionName: 'Hierarchy', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJReportCategories', sectionName: 'Report Categories', isExpanded: false },
            { sectionKey: 'mJReports', sectionName: 'Reports', isExpanded: false }
        ]);
    }
}

