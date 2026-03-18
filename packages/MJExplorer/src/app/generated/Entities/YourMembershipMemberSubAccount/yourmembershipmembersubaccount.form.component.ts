import { Component } from '@angular/core';
import { YourMembershipMemberSubAccountEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Member Sub Accounts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipmembersubaccount-form',
    templateUrl: './yourmembershipmembersubaccount.form.component.html'
})
export class YourMembershipMemberSubAccountFormComponent extends BaseFormComponent {
    public record!: YourMembershipMemberSubAccountEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'membershipHierarchy', sectionName: 'Membership Hierarchy', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

