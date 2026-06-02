import { Component } from '@angular/core';
import { hubspotmarketing_eventsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Marketing Events') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotmarketing_events-form',
    templateUrl: './hubspotmarketing_events.form.component.html'
})
export class hubspotmarketing_eventsFormComponent extends BaseFormComponent {
    public record!: hubspotmarketing_eventsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'eventDetails', sectionName: 'Event Details', isExpanded: true },
            { sectionKey: 'timeline', sectionName: 'Timeline', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

