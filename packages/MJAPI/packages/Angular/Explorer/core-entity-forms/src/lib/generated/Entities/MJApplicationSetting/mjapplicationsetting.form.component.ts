import { Component } from '@angular/core';
import { MJApplicationSettingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Application Settings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjapplicationsetting-form',
    templateUrl: './mjapplicationsetting.form.component.html'
})
export class MJApplicationSettingFormComponent extends BaseFormComponent {
    public record!: MJApplicationSettingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'applicationLinkage', sectionName: 'Application Linkage', isExpanded: true },
            { sectionKey: 'settingDefinition', sectionName: 'Setting Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

