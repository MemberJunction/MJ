import { Component } from '@angular/core';
import { YourMembershipMemberGroupEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Member Groups') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipmembergroup-form',
    templateUrl: './yourmembershipmembergroup.form.component.html'
})
export class YourMembershipMemberGroupFormComponent extends BaseFormComponent {
    public record!: YourMembershipMemberGroupEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'membershipAssignment', sectionName: 'Membership Assignment', isExpanded: true },
            { sectionKey: 'groupDetails', sectionName: 'Group Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

