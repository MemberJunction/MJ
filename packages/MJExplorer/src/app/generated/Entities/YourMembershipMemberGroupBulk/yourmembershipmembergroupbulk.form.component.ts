import { Component } from '@angular/core';
import { YourMembershipMemberGroupBulkEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Member Group Bulks') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipmembergroupbulk-form',
    templateUrl: './yourmembershipmembergroupbulk.form.component.html'
})
export class YourMembershipMemberGroupBulkFormComponent extends BaseFormComponent {
    public record!: YourMembershipMemberGroupBulkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'assignmentIdentity', sectionName: 'Assignment Identity', isExpanded: true },
            { sectionKey: 'groupDetails', sectionName: 'Group Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

