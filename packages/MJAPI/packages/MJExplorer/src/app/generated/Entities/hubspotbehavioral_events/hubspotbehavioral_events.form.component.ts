import { Component } from '@angular/core';
import { hubspotbehavioral_eventsEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Behavioral Events') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotbehavioral_events-form',
    templateUrl: './hubspotbehavioral_events.form.component.html'
})
export class hubspotbehavioral_eventsFormComponent extends BaseFormComponent {
    public record!: hubspotbehavioral_eventsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'eventDefinition', sectionName: 'Event Definition', isExpanded: true },
            { sectionKey: 'eventConfiguration', sectionName: 'Event Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

