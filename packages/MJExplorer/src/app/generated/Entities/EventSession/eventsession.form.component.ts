import { Component } from '@angular/core';
import { EventSessionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Event Sessions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-eventsession-form',
    templateUrl: './eventsession.form.component.html'
})
export class EventSessionFormComponent extends BaseFormComponent {
    public record!: EventSessionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'eventAssociation', sectionName: 'Event Association', isExpanded: true },
            { sectionKey: 'sessionOverview', sectionName: 'Session Overview', isExpanded: true },
            { sectionKey: 'scheduleVenue', sectionName: 'Schedule & Venue', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadEventSessionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
