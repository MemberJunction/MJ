import { Component } from '@angular/core';
import { SettingEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Settings') // Tell MemberJunction about this class
@Component({
    selector: 'gen-setting-form',
    templateUrl: './setting.form.component.html'
})
export class SettingFormComponent extends BaseFormComponent {
    public record!: SettingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'settingDefinition', sectionName: 'Setting Definition', isExpanded: true },
            { sectionKey: 'categorizationOrdering', sectionName: 'Categorization & Ordering', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'organizationSettings', sectionName: 'Organization Settings', isExpanded: false }
        ]);
    }
}

export function LoadSettingFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
