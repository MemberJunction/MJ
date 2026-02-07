import { Component } from '@angular/core';
import { ApplicationSettingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Application Settings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-applicationsetting-form',
    templateUrl: './applicationsetting.form.component.html'
})
export class ApplicationSettingFormComponent extends BaseFormComponent {
    public record!: ApplicationSettingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'applicationLinkage', sectionName: 'Application Linkage', isExpanded: true },
            { sectionKey: 'settingDefinition', sectionName: 'Setting Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadApplicationSettingFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
