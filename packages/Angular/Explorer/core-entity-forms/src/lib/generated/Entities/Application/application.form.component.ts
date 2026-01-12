import { Component } from '@angular/core';
import { ApplicationEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Applications') // Tell MemberJunction about this class
@Component({
    selector: 'gen-application-form',
    templateUrl: './application.form.component.html'
})
export class ApplicationFormComponent extends BaseFormComponent {
    public record!: ApplicationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'applicationConfiguration', sectionName: 'Application Configuration', isExpanded: true },
            { sectionKey: 'generalInformation', sectionName: 'General Information', isExpanded: true },
            { sectionKey: 'navigationSettings', sectionName: 'Navigation Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'entities', sectionName: 'Entities', isExpanded: false },
            { sectionKey: 'applicationSettings', sectionName: 'Application Settings', isExpanded: false },
            { sectionKey: 'userApplications', sectionName: 'User Applications', isExpanded: false },
            { sectionKey: 'dashboards', sectionName: 'Dashboards', isExpanded: false },
            { sectionKey: 'mJDashboardUserPreferences', sectionName: 'MJ: Dashboard User Preferences', isExpanded: false }
        ]);
    }
}

export function LoadApplicationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
