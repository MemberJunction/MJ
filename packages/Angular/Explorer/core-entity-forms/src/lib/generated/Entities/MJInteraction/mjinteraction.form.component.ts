import { Component } from '@angular/core';
import { MJInteractionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Interactions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjinteraction-form',
    templateUrl: './mjinteraction.form.component.html'
})
export class MJInteractionFormComponent extends BaseFormComponent {
    public record!: MJInteractionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'interactionDetails', sectionName: 'Interaction Details', isExpanded: true },
            { sectionKey: 'technicalContext', sectionName: 'Technical Context', isExpanded: true },
            { sectionKey: 'interactionTimeline', sectionName: 'Interaction Timeline', isExpanded: true },
            { sectionKey: 'financialDetails', sectionName: 'Financial Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJInteractionEvents', sectionName: 'Interaction Events', isExpanded: false },
            { sectionKey: 'mJInteractionLinks', sectionName: 'Interaction Links', isExpanded: false },
            { sectionKey: 'mJInteractionOffers', sectionName: 'Interaction Offers', isExpanded: false }
        ]);
    }
}

