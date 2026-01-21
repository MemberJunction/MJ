import { Component } from '@angular/core';
import { DashboardPartTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Dashboard Part Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-dashboardparttype-form',
    templateUrl: './dashboardparttype.form.component.html'
})
export class DashboardPartTypeFormComponent extends BaseFormComponent {
    public record!: DashboardPartTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'panelTypeInformation', sectionName: 'Panel Type Information', isExpanded: true },
            { sectionKey: 'rendererSettings', sectionName: 'Renderer Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadDashboardPartTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
