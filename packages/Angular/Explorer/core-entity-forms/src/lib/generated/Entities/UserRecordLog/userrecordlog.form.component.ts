import { Component } from '@angular/core';
import { UserRecordLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'User Record Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-userrecordlog-form',
    templateUrl: './userrecordlog.form.component.html'
})
export class UserRecordLogFormComponent extends BaseFormComponent {
    public record!: UserRecordLogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'technicalDetails', sectionName: 'Technical Details', isExpanded: true },
            { sectionKey: 'interactionSummary', sectionName: 'Interaction Summary', isExpanded: true },
            { sectionKey: 'userProfile', sectionName: 'User Profile', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

