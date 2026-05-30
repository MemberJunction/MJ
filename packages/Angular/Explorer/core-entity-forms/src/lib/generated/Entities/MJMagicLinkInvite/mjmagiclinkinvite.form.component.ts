import { Component } from '@angular/core';
import { MJMagicLinkInviteEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

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
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

