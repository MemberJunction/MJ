import { Component } from '@angular/core';
import { MJUserSettingsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: User Settings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjusersettings-form',
    templateUrl: './mjusersettings.form.component.html'
})
export class MJUserSettingsFormComponent extends BaseFormComponent {
    public record!: MJUserSettingsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'userPreferenceSettings', sectionName: 'User Preference Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

