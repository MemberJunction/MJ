import { Component } from '@angular/core';
import { MJApplicationSettingsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Application Settings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjapplicationsettings-form',
    templateUrl: './mjapplicationsettings.form.component.html'
})
export class MJApplicationSettingsFormComponent extends BaseFormComponent {
    public record!: MJApplicationSettingsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'applicationLinkage', sectionName: 'Application Linkage', isExpanded: true },
            { sectionKey: 'settingDefinition', sectionName: 'Setting Definition', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

