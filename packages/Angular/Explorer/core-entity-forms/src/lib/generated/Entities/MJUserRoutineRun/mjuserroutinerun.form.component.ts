import { Component } from '@angular/core';
import { MJUserRoutineRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: User Routine Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjuserroutinerun-form',
    templateUrl: './mjuserroutinerun.form.component.html'
})
export class MJUserRoutineRunFormComponent extends BaseFormComponent {
    public record!: MJUserRoutineRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'routineContext', sectionName: 'Routine Context', isExpanded: true },
            { sectionKey: 'executionTimeline', sectionName: 'Execution Timeline', isExpanded: true },
            { sectionKey: 'executionResults', sectionName: 'Execution Results', isExpanded: true },
            { sectionKey: 'linkedExecutions', sectionName: 'Linked Executions', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

