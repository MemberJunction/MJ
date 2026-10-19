import { Component } from '@angular/core';
import { MJInteractionLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Interaction Links') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjinteractionlink-form',
    templateUrl: './mjinteractionlink.form.component.html'
})
export class MJInteractionLinkFormComponent extends BaseFormComponent {
    public record!: MJInteractionLinkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'interactionAssociation', sectionName: 'Interaction Association', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

