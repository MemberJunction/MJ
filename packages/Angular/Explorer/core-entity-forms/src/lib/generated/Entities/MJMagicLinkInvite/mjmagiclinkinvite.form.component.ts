import { Component } from '@angular/core';
import { MJMagicLinkInviteEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Magic Link Invites') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmagiclinkinvite-form',
    templateUrl: './mjmagiclinkinvite.form.component.html'
})
export class MJMagicLinkInviteFormComponent extends BaseFormComponent {
    public record!: MJMagicLinkInviteEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJMagicLinkInviteAllowedDomains', sectionName: 'Magic Link Invite Allowed Domains', isExpanded: false },
            { sectionKey: 'mJMagicLinkInviteAllowedPaths', sectionName: 'Magic Link Invite Allowed Paths', isExpanded: false },
            { sectionKey: 'mJMagicLinkInviteApplications', sectionName: 'Magic Link Invite Applications', isExpanded: false },
            { sectionKey: 'mJMagicLinkInviteRoles', sectionName: 'Magic Link Invite Roles', isExpanded: false },
            { sectionKey: 'mJMagicLinkRedemptions', sectionName: 'Magic Link Redemptions', isExpanded: false }
        ]);
    }
}

