import { Component } from '@angular/core';
import { MJDashboardCategoriesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Dashboard Categories') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjdashboardcategories-form',
    templateUrl: './mjdashboardcategories.form.component.html'
})
export class MJDashboardCategoriesFormComponent extends BaseFormComponent {
    public record!: MJDashboardCategoriesEntity;

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

