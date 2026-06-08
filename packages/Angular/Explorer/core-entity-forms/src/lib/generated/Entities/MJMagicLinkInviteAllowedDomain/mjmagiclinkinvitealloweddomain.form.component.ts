import { Component } from '@angular/core';
import { MJMagicLinkInviteAllowedDomainEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Magic Link Invite Allowed Domains') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmagiclinkinvitealloweddomain-form',
    templateUrl: './mjmagiclinkinvitealloweddomain.form.component.html'
})
export class MJMagicLinkInviteAllowedDomainFormComponent extends BaseFormComponent {
    public record!: MJMagicLinkInviteAllowedDomainEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

