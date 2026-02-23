import { Component } from '@angular/core';
import { MJCommunicationRunsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Communication Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationruns-form',
    templateUrl: './mjcommunicationruns.form.component.html'
})
export class MJCommunicationRunsFormComponent extends BaseFormComponent {
    public record!: MJCommunicationRunsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'runMetadata', sectionName: 'Run Metadata', isExpanded: false },
            { sectionKey: 'executionTimeline', sectionName: 'Execution Timeline', isExpanded: true },
            { sectionKey: 'resultNotes', sectionName: 'Result & Notes', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'communicationLogs', sectionName: 'Communication Logs', isExpanded: false }
        ]);
    }
}

