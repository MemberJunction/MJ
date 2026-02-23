import { Component } from '@angular/core';
import { MJDashboardUserStatesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Dashboard User States') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjdashboarduserstates-form',
    templateUrl: './mjdashboarduserstates.form.component.html'
})
export class MJDashboardUserStatesFormComponent extends BaseFormComponent {
    public record!: MJDashboardUserStatesEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifiersKeys', sectionName: 'Identifiers & Keys', isExpanded: true },
            { sectionKey: 'dashboardStateDetails', sectionName: 'Dashboard State Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

