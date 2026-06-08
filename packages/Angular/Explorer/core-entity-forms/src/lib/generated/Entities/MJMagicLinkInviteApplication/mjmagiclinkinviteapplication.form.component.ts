import { Component } from '@angular/core';
import { MJMagicLinkInviteApplicationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Magic Link Invite Applications') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmagiclinkinviteapplication-form',
    templateUrl: './mjmagiclinkinviteapplication.form.component.html'
})
export class MJMagicLinkInviteApplicationFormComponent extends BaseFormComponent {
    public record!: MJMagicLinkInviteApplicationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

