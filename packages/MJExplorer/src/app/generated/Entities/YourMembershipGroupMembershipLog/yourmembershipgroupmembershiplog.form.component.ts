import { Component } from '@angular/core';
import { YourMembershipGroupMembershipLogEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Group Membership Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipgroupmembershiplog-form',
    templateUrl: './yourmembershipgroupmembershiplog.form.component.html'
})
export class YourMembershipGroupMembershipLogFormComponent extends BaseFormComponent {
    public record!: YourMembershipGroupMembershipLogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'logEntryDetails', sectionName: 'Log Entry Details', isExpanded: true },
            { sectionKey: 'memberInformation', sectionName: 'Member Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

