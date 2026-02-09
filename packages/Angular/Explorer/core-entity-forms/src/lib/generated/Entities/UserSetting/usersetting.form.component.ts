import { Component } from '@angular/core';
import { UserSettingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: User Settings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-usersetting-form',
    templateUrl: './usersetting.form.component.html'
})
export class UserSettingFormComponent extends BaseFormComponent {
    public record!: UserSettingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'userPreferenceSettings', sectionName: 'User Preference Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

