import { Component } from '@angular/core';
import { hubspotevent_completionsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Event Completions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotevent_completions-form',
    templateUrl: './hubspotevent_completions.form.component.html'
})
export class hubspotevent_completionsFormComponent extends BaseFormComponent {
    public record!: hubspotevent_completionsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'eventContext', sectionName: 'Event Context', isExpanded: true },
            { sectionKey: 'eventData', sectionName: 'Event Data', isExpanded: true },
            { sectionKey: 'userTracking', sectionName: 'User Tracking', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

