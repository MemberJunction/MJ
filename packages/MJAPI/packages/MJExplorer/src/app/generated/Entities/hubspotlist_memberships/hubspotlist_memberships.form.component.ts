import { Component } from '@angular/core';
import { hubspotlist_membershipsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'List Memberships') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotlist_memberships-form',
    templateUrl: './hubspotlist_memberships.form.component.html'
})
export class hubspotlist_membershipsFormComponent extends BaseFormComponent {
    public record!: hubspotlist_membershipsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'membershipDetails', sectionName: 'Membership Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

