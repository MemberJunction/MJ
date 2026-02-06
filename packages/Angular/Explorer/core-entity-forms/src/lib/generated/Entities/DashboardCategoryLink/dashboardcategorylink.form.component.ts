import { Component } from '@angular/core';
import { DashboardCategoryLinkEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Dashboard Category Links') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-dashboardcategorylink-form',
    templateUrl: './dashboardcategorylink.form.component.html'
})
export class DashboardCategoryLinkFormComponent extends BaseFormComponent {
    public record!: DashboardCategoryLinkEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'dashboardAssociation', sectionName: 'Dashboard Association', isExpanded: true },
            { sectionKey: 'displaySettings', sectionName: 'Display Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadDashboardCategoryLinkFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
