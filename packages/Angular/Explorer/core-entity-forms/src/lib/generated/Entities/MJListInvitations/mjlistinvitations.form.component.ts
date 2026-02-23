import { Component } from '@angular/core';
import { MJListInvitationsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: List Invitations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjlistinvitations-form',
    templateUrl: './mjlistinvitations.form.component.html'
})
export class MJListInvitationsFormComponent extends BaseFormComponent {
    public record!: MJListInvitationsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'invitationDetails', sectionName: 'Invitation Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

