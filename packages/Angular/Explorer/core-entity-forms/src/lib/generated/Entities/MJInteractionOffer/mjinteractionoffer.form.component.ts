import { Component } from '@angular/core';
import { MJInteractionOfferEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Interaction Offers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjinteractionoffer-form',
    templateUrl: './mjinteractionoffer.form.component.html'
})
export class MJInteractionOfferFormComponent extends BaseFormComponent {
    public record!: MJInteractionOfferEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'interactionDetails', sectionName: 'Interaction Details', isExpanded: true },
            { sectionKey: 'participantDetails', sectionName: 'Participant Details', isExpanded: true },
            { sectionKey: 'handoverContext', sectionName: 'Handover Context', isExpanded: true },
            { sectionKey: 'timeline', sectionName: 'Timeline', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

