import { Component } from '@angular/core';
import { MJApplicationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Applications') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjapplication-form',
    templateUrl: './mjapplication.form.component.html'
})
export class MJApplicationFormComponent extends BaseFormComponent {
    public record!: MJApplicationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'applicationConfiguration', sectionName: 'Application Configuration', isExpanded: true },
            { sectionKey: 'generalInformation', sectionName: 'General Information', isExpanded: true },
            { sectionKey: 'navigationSettings', sectionName: 'Navigation Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJApplicationEntities', sectionName: 'Entities', isExpanded: false },
            { sectionKey: 'mJApplicationSettings', sectionName: 'Application Settings', isExpanded: false },
            { sectionKey: 'mJUserApplications', sectionName: 'User Applications', isExpanded: false },
            { sectionKey: 'mJDashboards', sectionName: 'Dashboards', isExpanded: false },
            { sectionKey: 'mJDashboardUserPreferences', sectionName: 'Dashboard User Preferences', isExpanded: false }
        ]);
    }
}

