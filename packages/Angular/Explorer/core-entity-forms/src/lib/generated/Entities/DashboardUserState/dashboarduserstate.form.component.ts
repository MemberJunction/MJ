import { Component } from '@angular/core';
import { DashboardUserStateEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Dashboard User States') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-dashboarduserstate-form',
    templateUrl: './dashboarduserstate.form.component.html'
})
export class DashboardUserStateFormComponent extends BaseFormComponent {
    public record!: DashboardUserStateEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifiersKeys', sectionName: 'Identifiers & Keys', isExpanded: true },
            { sectionKey: 'dashboardStateDetails', sectionName: 'Dashboard State Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadDashboardUserStateFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
