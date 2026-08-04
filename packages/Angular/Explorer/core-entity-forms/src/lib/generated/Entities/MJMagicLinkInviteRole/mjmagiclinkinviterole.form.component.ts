import { Component } from '@angular/core';
import { MJMagicLinkInviteRoleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Magic Link Invite Roles') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmagiclinkinviterole-form',
    templateUrl: './mjmagiclinkinviterole.form.component.html'
})
export class MJMagicLinkInviteRoleFormComponent extends BaseFormComponent {
    public record!: MJMagicLinkInviteRoleEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

