import { Component } from '@angular/core';
import { YourMembershipMemberTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Member Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipmembertype-form',
    templateUrl: './yourmembershipmembertype.form.component.html'
})
export class YourMembershipMemberTypeFormComponent extends BaseFormComponent {
    public record!: YourMembershipMemberTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'classificationDetails', sectionName: 'Classification Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'memberProfiles', sectionName: 'Member Profiles', isExpanded: false },
            { sectionKey: 'personIDs', sectionName: 'Person IDs', isExpanded: false },
            { sectionKey: 'duesTransactions', sectionName: 'Dues Transactions', isExpanded: false },
            { sectionKey: 'members', sectionName: 'Members', isExpanded: false }
        ]);
    }
}

