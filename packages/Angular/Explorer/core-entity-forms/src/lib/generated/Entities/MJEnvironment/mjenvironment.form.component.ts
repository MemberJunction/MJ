import { Component } from '@angular/core';
import { MJEnvironmentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Environments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjenvironment-form',
    templateUrl: './mjenvironment.form.component.html'
})
export class MJEnvironmentFormComponent extends BaseFormComponent {
    public record!: MJEnvironmentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'technicalMetadata', sectionName: 'Technical Metadata', isExpanded: false },
            { sectionKey: 'environmentDefinition', sectionName: 'Environment Definition', isExpanded: true },
            { sectionKey: 'environmentSettings', sectionName: 'Environment Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJArtifacts', sectionName: 'Artifacts', isExpanded: false },
            { sectionKey: 'mJCollections', sectionName: 'Collections', isExpanded: false },
            { sectionKey: 'mJProjects', sectionName: 'Projects', isExpanded: false },
            { sectionKey: 'mJDashboards', sectionName: 'Dashboards', isExpanded: false },
            { sectionKey: 'mJTasks', sectionName: 'Tasks', isExpanded: false },
            { sectionKey: 'mJReports', sectionName: 'Reports', isExpanded: false },
            { sectionKey: 'mJConversations', sectionName: 'Conversations', isExpanded: false }
        ]);
    }
}

