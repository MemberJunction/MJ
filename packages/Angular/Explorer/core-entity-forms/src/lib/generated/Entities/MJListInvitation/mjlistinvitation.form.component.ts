import { Component } from '@angular/core';
import { MJListInvitationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: List Invitations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjlistinvitation-form',
    templateUrl: './mjlistinvitation.form.component.html'
})
export class MJListInvitationFormComponent extends BaseFormComponent {
    public record!: MJListInvitationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'invitationDetails', sectionName: 'Invitation Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

