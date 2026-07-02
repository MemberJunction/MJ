import { Component } from '@angular/core';
import { MJUserRoutineEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: User Routines') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjuserroutine-form',
    templateUrl: './mjuserroutine.form.component.html'
})
export class MJUserRoutineFormComponent extends BaseFormComponent {
    public record!: MJUserRoutineEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'routineOwnership', sectionName: 'Routine Ownership', isExpanded: true },
            { sectionKey: 'routineConfiguration', sectionName: 'Routine Configuration', isExpanded: true },
            { sectionKey: 'executionDetails', sectionName: 'Execution Details', isExpanded: true },
            { sectionKey: 'schedulingAndNotifications', sectionName: 'Scheduling and Notifications', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJUserRoutineRecipients', sectionName: 'User Routine Recipients', isExpanded: false },
            { sectionKey: 'mJUserRoutineRuns', sectionName: 'User Routine Runs', isExpanded: false }
        ]);
    }
}

