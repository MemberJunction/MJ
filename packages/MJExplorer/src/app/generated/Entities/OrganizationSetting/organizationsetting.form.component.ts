import { Component } from '@angular/core';
import { OrganizationSettingEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Organization Settings') // Tell MemberJunction about this class
@Component({
    selector: 'gen-organizationsetting-form',
    templateUrl: './organizationsetting.form.component.html'
})
export class OrganizationSettingFormComponent extends BaseFormComponent {
    public record!: OrganizationSettingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifiers', sectionName: 'Identifiers', isExpanded: true },
            { sectionKey: 'settingDetails', sectionName: 'Setting Details', isExpanded: true },
            { sectionKey: 'scopeChannel', sectionName: 'Scope & Channel', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadOrganizationSettingFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
