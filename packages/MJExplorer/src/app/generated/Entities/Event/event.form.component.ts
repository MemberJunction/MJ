import { Component } from '@angular/core';
import { EventEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Events') // Tell MemberJunction about this class
@Component({
    selector: 'gen-event-form',
    templateUrl: './event.form.component.html'
})
export class EventFormComponent extends BaseFormComponent {
    public record!: EventEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'eventBasics', sectionName: 'Event Basics', isExpanded: true },
            { sectionKey: 'scheduleTiming', sectionName: 'Schedule & Timing', isExpanded: true },
            { sectionKey: 'venueAccess', sectionName: 'Venue & Access', isExpanded: false },
            { sectionKey: 'pricingCredits', sectionName: 'Pricing & Credits', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'eventSessions', sectionName: 'Event Sessions', isExpanded: false },
            { sectionKey: 'eventRegistrations', sectionName: 'Event Registrations', isExpanded: false }
        ]);
    }
}

export function LoadEventFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
