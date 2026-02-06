import { Component } from '@angular/core';
import { ListInvitationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: List Invitations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-listinvitation-form',
    templateUrl: './listinvitation.form.component.html'
})
export class ListInvitationFormComponent extends BaseFormComponent {
    public record!: ListInvitationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'invitationDetails', sectionName: 'Invitation Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadListInvitationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
