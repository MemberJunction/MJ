import { Component } from '@angular/core';
import { AssociationDemoChapterMembershipEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Chapter Memberships') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemochaptermembership-form',
    templateUrl: './associationdemochaptermembership.form.component.html'
})
export class AssociationDemoChapterMembershipFormComponent extends BaseFormComponent {
    public record!: AssociationDemoChapterMembershipEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'membershipDetails', sectionName: 'Membership Details', isExpanded: true },
            { sectionKey: 'membershipStatus', sectionName: 'Membership Status', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

