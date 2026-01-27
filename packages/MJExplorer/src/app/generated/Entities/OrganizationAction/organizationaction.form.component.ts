import { Component } from '@angular/core';
import { OrganizationActionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Organization Actions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-organizationaction-form',
    templateUrl: './organizationaction.form.component.html'
})
export class OrganizationActionFormComponent extends BaseFormComponent {
    public record!: OrganizationActionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'organizationMapping', sectionName: 'Organization Mapping', isExpanded: true },
            { sectionKey: 'actionSettings', sectionName: 'Action Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadOrganizationActionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
