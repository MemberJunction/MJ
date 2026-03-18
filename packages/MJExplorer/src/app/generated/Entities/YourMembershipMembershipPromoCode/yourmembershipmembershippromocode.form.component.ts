import { Component } from '@angular/core';
import { YourMembershipMembershipPromoCodeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Membership Promo Codes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipmembershippromocode-form',
    templateUrl: './yourmembershipmembershippromocode.form.component.html'
})
export class YourMembershipMembershipPromoCodeFormComponent extends BaseFormComponent {
    public record!: YourMembershipMembershipPromoCodeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'promotionDetails', sectionName: 'Promotion Details', isExpanded: true },
            { sectionKey: 'usageAndExpiration', sectionName: 'Usage and Expiration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

