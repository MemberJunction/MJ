import { Component } from '@angular/core';
import { MJDashboardCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Dashboard Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjdashboardcategory-form',
    templateUrl: './mjdashboardcategory.form.component.html'
})
export class MJDashboardCategoryFormComponent extends BaseFormComponent {
    public record!: MJDashboardCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryDetails', sectionName: 'Category Details', isExpanded: true },
            { sectionKey: 'hierarchyStructure', sectionName: 'Hierarchy Structure', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'dashboardCategories', sectionName: 'Dashboard Categories', isExpanded: false },
            { sectionKey: 'dashboards', sectionName: 'Dashboards', isExpanded: false },
            { sectionKey: 'mJDashboardCategoryLinks', sectionName: 'MJ: Dashboard Category Links', isExpanded: false },
            { sectionKey: 'mJDashboardCategoryPermissions', sectionName: 'MJ: Dashboard Category Permissions', isExpanded: false }
        ]);
    }
}

