import { Component } from '@angular/core';
import { MJDashboardPartTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Dashboard Part Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjdashboardparttype-form',
    templateUrl: './mjdashboardparttype.form.component.html'
})
export class MJDashboardPartTypeFormComponent extends BaseFormComponent {
    public record!: MJDashboardPartTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'panelTypeInformation', sectionName: 'Panel Type Information', isExpanded: true },
            { sectionKey: 'rendererSettings', sectionName: 'Renderer Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

