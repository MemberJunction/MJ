import { Component } from '@angular/core';
import { AssociationDemoCampaignEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Campaigns') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemocampaign-form',
    templateUrl: './associationdemocampaign.form.component.html'
})
export class AssociationDemoCampaignFormComponent extends BaseFormComponent {
    public record!: AssociationDemoCampaignEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'campaignMembers', sectionName: 'Campaign Members', isExpanded: false },
            { sectionKey: 'emailSends', sectionName: 'Email Sends', isExpanded: false }
        ]);
    }
}

