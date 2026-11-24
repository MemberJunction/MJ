import { Component } from '@angular/core';
import { MJCommunicationSenderTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Communication Sender Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationsendertype-form',
    templateUrl: './mjcommunicationsendertype.form.component.html'
})
export class MJCommunicationSenderTypeFormComponent extends BaseFormComponent {
    public record!: MJCommunicationSenderTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJCommunicationSenders', sectionName: 'Communication Senders', isExpanded: false }
        ]);
    }
}

