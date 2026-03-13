import { Component } from '@angular/core';
import { MJUserSettingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: User Settings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjusersetting-form',
    templateUrl: './mjusersetting.form.component.html'
})
export class MJUserSettingFormComponent extends BaseFormComponent {
    public record!: MJUserSettingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'userPreferenceSettings', sectionName: 'User Preference Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

