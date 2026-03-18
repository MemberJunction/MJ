import { Component } from '@angular/core';
import { YourMembershipMemberReferralEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Member Referrals') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipmemberreferral-form',
    templateUrl: './yourmembershipmemberreferral.form.component.html'
})
export class YourMembershipMemberReferralFormComponent extends BaseFormComponent {
    public record!: YourMembershipMemberReferralEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'referralDetails', sectionName: 'Referral Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

