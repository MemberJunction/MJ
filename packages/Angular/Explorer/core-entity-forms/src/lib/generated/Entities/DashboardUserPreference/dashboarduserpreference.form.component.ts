import { Component } from '@angular/core';
import { DashboardUserPreferenceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Dashboard User Preferences') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-dashboarduserpreference-form',
    templateUrl: './dashboarduserpreference.form.component.html'
})
export class DashboardUserPreferenceFormComponent extends BaseFormComponent {
    public record!: DashboardUserPreferenceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identificationOwnership', sectionName: 'Identification & Ownership', isExpanded: true },
            { sectionKey: 'dashboardAssignment', sectionName: 'Dashboard Assignment', isExpanded: true },
            { sectionKey: 'scopeSettings', sectionName: 'Scope Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadDashboardUserPreferenceFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
