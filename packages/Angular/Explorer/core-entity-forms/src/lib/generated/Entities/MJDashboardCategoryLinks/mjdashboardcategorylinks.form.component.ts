import { Component } from '@angular/core';
import { MJDashboardCategoryLinksEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Dashboard Category Links') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjdashboardcategorylinks-form',
    templateUrl: './mjdashboardcategorylinks.form.component.html'
})
export class MJDashboardCategoryLinksFormComponent extends BaseFormComponent {
    public record!: MJDashboardCategoryLinksEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'dashboardAssociation', sectionName: 'Dashboard Association', isExpanded: true },
            { sectionKey: 'displaySettings', sectionName: 'Display Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

