import { Component } from '@angular/core';
import { MJInteractionEventEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Interaction Events') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjinteractionevent-form',
    templateUrl: './mjinteractionevent.form.component.html'
})
export class MJInteractionEventFormComponent extends BaseFormComponent {
    public record!: MJInteractionEventEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'interactionContext', sectionName: 'Interaction Context', isExpanded: true },
            { sectionKey: 'actorInformation', sectionName: 'Actor Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

