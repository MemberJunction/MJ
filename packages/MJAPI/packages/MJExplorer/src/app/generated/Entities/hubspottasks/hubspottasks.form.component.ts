import { Component } from '@angular/core';
import { hubspottasksEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Tasks') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspottasks-form',
    templateUrl: './hubspottasks.form.component.html'
})
export class hubspottasksFormComponent extends BaseFormComponent {
    public record!: hubspottasksEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'associatedEntities', sectionName: 'Associated Entities', isExpanded: true },
            { sectionKey: 'taskOverview', sectionName: 'Task Overview', isExpanded: true },
            { sectionKey: 'timelineAndScheduling', sectionName: 'Timeline and Scheduling', isExpanded: false },
            { sectionKey: 'taskDependencies', sectionName: 'Task Dependencies', isExpanded: false },
            { sectionKey: 'automationAndSequences', sectionName: 'Automation and Sequences', isExpanded: false },
            { sectionKey: 'taskStatusAndWorkflow', sectionName: 'Task Status and Workflow', isExpanded: false },
            { sectionKey: 'assignmentAndOwnership', sectionName: 'Assignment and Ownership', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

