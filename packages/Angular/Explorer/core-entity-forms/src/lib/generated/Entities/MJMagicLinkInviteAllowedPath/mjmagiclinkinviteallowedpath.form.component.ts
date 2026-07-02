import { Component } from '@angular/core';
import { MJMagicLinkInviteAllowedPathEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Magic Link Invite Allowed Paths') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmagiclinkinviteallowedpath-form',
    templateUrl: './mjmagiclinkinviteallowedpath.form.component.html'
})
export class MJMagicLinkInviteAllowedPathFormComponent extends BaseFormComponent {
    public record!: MJMagicLinkInviteAllowedPathEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

