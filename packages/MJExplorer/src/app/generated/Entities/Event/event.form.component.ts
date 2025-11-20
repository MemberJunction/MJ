import { Component } from '@angular/core';
import { EventEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-user-view-grid"

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
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'events', sectionName: 'Events', isExpanded: false },
            { sectionKey: 'submissions', sectionName: 'Submissions', isExpanded: false },
            { sectionKey: 'eventReviewTasks', sectionName: 'Event Review Tasks', isExpanded: false }
        ]);
    }
}

export function LoadEventFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
