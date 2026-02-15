import { Component } from '@angular/core';
import { MJUserRecordLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: User Record Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjuserrecordlog-form',
    templateUrl: './mjuserrecordlog.form.component.html'
})
export class MJUserRecordLogFormComponent extends BaseFormComponent {
    public record!: MJUserRecordLogEntity;

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

