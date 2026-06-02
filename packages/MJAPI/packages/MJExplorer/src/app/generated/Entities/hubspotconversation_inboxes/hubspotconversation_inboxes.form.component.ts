import { Component } from '@angular/core';
import { hubspotconversation_inboxesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Conversation Inboxes') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotconversation_inboxes-form',
    templateUrl: './hubspotconversation_inboxes.form.component.html'
})
export class hubspotconversation_inboxesFormComponent extends BaseFormComponent {
    public record!: hubspotconversation_inboxesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'inboxConfiguration', sectionName: 'Inbox Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

