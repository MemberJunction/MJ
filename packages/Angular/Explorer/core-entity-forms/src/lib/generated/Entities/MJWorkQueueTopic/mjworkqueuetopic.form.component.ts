import { Component } from '@angular/core';
import { MJWorkQueueTopicEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Work Queue Topics') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjworkqueuetopic-form',
    templateUrl: './mjworkqueuetopic.form.component.html'
})
export class MJWorkQueueTopicFormComponent extends BaseFormComponent {
    public record!: MJWorkQueueTopicEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJWorkQueueSubscriptions', sectionName: 'Work Queue Subscriptions', isExpanded: false },
            { sectionKey: 'mJWorkQueueDeduplications', sectionName: 'Work Queue Deduplications', isExpanded: false },
            { sectionKey: 'mJWorkQueueMessages', sectionName: 'Work Queue Messages', isExpanded: false }
        ]);
    }
}

