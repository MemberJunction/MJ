import { Component } from '@angular/core';
import { EventRegistrationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Event Registrations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-eventregistration-form',
    templateUrl: './eventregistration.form.component.html'
})
export class EventRegistrationFormComponent extends BaseFormComponent {
    public record!: EventRegistrationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadEventRegistrationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
