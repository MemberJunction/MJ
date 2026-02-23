import { Component } from '@angular/core';
import { MJDashboardUserPreferencesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Dashboard User Preferences') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjdashboarduserpreferences-form',
    templateUrl: './mjdashboarduserpreferences.form.component.html'
})
export class MJDashboardUserPreferencesFormComponent extends BaseFormComponent {
    public record!: MJDashboardUserPreferencesEntity;

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

