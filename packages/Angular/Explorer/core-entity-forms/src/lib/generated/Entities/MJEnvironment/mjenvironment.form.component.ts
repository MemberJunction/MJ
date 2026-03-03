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
            { sectionKey: 'mJArtifacts', sectionName: 'MJ: Artifacts', isExpanded: false },
            { sectionKey: 'mJCollections', sectionName: 'MJ: Collections', isExpanded: false },
            { sectionKey: 'mJProjects', sectionName: 'MJ: Projects', isExpanded: false },
            { sectionKey: 'dashboards', sectionName: 'Dashboards', isExpanded: false },
            { sectionKey: 'mJTasks', sectionName: 'MJ: Tasks', isExpanded: false },
            { sectionKey: 'reports', sectionName: 'Reports', isExpanded: false },
            { sectionKey: 'conversations', sectionName: 'Conversations', isExpanded: false }
        ]);
    }
}

