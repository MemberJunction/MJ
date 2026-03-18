import { Component } from '@angular/core';
import { HubSpotTaskEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Tasks') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspottask-form',
    templateUrl: './hubspottask.form.component.html'
})
export class HubSpotTaskFormComponent extends BaseFormComponent {
    public record!: HubSpotTaskEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'taskDetails', sectionName: 'Task Details', isExpanded: true },
            { sectionKey: 'timelineAndAssignment', sectionName: 'Timeline and Assignment', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'contactTasks', sectionName: 'Contact Tasks', isExpanded: false },
            { sectionKey: 'companyTasks', sectionName: 'Company Tasks', isExpanded: false },
            { sectionKey: 'ticketTasks', sectionName: 'Ticket Tasks', isExpanded: false },
            { sectionKey: 'dealTasks', sectionName: 'Deal Tasks', isExpanded: false }
        ]);
    }
}

