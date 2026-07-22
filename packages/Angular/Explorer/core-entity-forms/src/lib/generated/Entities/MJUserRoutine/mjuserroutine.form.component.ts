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
            { sectionKey: 'routineConfiguration', sectionName: 'Routine Configuration', isExpanded: true },
            { sectionKey: 'executionSettings', sectionName: 'Execution Settings', isExpanded: true },
            { sectionKey: 'schedulingAndTiming', sectionName: 'Scheduling and Timing', isExpanded: true },
            { sectionKey: 'notifications', sectionName: 'Notifications', isExpanded: true },
            { sectionKey: 'executionHistory', sectionName: 'Execution History', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJUserRoutineRuns', sectionName: 'User Routine Runs', isExpanded: false },
            { sectionKey: 'mJUserRoutineRecipients', sectionName: 'User Routine Recipients', isExpanded: false }
        ]);
    }
}

