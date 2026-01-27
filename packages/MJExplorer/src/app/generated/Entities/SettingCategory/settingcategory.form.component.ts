import { Component } from '@angular/core';
import { SettingCategoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Setting Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-settingcategory-form',
    templateUrl: './settingcategory.form.component.html'
})
export class SettingCategoryFormComponent extends BaseFormComponent {
    public record!: SettingCategoryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'categoryDetails', sectionName: 'Category Details', isExpanded: true },
            { sectionKey: 'hierarchy', sectionName: 'Hierarchy', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'settingCategories', sectionName: 'Setting Categories', isExpanded: false },
            { sectionKey: 'settings', sectionName: 'Settings', isExpanded: false }
        ]);
    }
}

export function LoadSettingCategoryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
