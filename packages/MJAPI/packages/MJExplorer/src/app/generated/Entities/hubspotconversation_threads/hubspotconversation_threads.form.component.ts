import { Component } from '@angular/core';
import { hubspotconversation_threadsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Conversation Threads') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotconversation_threads-form',
    templateUrl: './hubspotconversation_threads.form.component.html'
})
export class hubspotconversation_threadsFormComponent extends BaseFormComponent {
    public record!: hubspotconversation_threadsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'assignmentsAndContext', sectionName: 'Assignments and Context', isExpanded: true },
            { sectionKey: 'threadOverview', sectionName: 'Thread Overview', isExpanded: true },
            { sectionKey: 'channelInformation', sectionName: 'Channel Information', isExpanded: false },
            { sectionKey: 'timeline', sectionName: 'Timeline', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

