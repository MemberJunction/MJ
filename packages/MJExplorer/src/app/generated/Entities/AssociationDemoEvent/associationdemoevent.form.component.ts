import { Component } from '@angular/core';
import { AssociationDemoEventEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Events') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoevent-form',
    templateUrl: './associationdemoevent.form.component.html'
})
export class AssociationDemoEventFormComponent extends BaseFormComponent {
    public record!: AssociationDemoEventEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'eventOverview', sectionName: 'Event Overview', isExpanded: true },
            { sectionKey: 'scheduleAndLocation', sectionName: 'Schedule and Location', isExpanded: true },
            { sectionKey: 'virtualAccess', sectionName: 'Virtual Access', isExpanded: false },
            { sectionKey: 'associations', sectionName: 'Associations', isExpanded: false },
            { sectionKey: 'registrationAndPricing', sectionName: 'Registration and Pricing', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'eventRegistrations', sectionName: 'Event Registrations', isExpanded: false },
            { sectionKey: 'eventSessions', sectionName: 'Event Sessions', isExpanded: false }
        ]);
    }
}

