import { Component } from '@angular/core';
import { ReportCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Report Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-reportcategory-form',
    templateUrl: './reportcategory.form.component.html'
})
export class ReportCategoryFormComponent extends BaseFormComponent {
    public record!: ReportCategoryEntity;

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

export function LoadReportCategoryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
