import { Component } from '@angular/core';
import { IzzyActionOrganizationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Izzy Action Organizations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-izzyactionorganization-form',
    templateUrl: './izzyactionorganization.form.component.html'
})
export class IzzyActionOrganizationFormComponent extends BaseFormComponent {
    public record!: IzzyActionOrganizationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'actionOrganization', sectionName: 'Action & Organization', isExpanded: true },
            { sectionKey: 'grantDetails', sectionName: 'Grant Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadIzzyActionOrganizationFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
