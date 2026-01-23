import { Component } from '@angular/core';
import { ComponentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Components') // Tell MemberJunction about this class
@Component({
    selector: 'gen-component-form',
    templateUrl: './component.form.component.html'
})
export class ComponentFormComponent extends BaseFormComponent {
    public record!: ComponentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identificationVersioning', sectionName: 'Identification & Versioning', isExpanded: true },
            { sectionKey: 'specificationDesign', sectionName: 'Specification & Design', isExpanded: true },
            { sectionKey: 'developerOwnership', sectionName: 'Developer & Ownership', isExpanded: false },
            { sectionKey: 'registrySynchronization', sectionName: 'Registry & Synchronization', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJComponentDependencies', sectionName: 'MJ: Component Dependencies', isExpanded: false },
            { sectionKey: 'mJComponentLibraryLinks', sectionName: 'MJ: Component Library Links', isExpanded: false },
            { sectionKey: 'mJComponentDependencies1', sectionName: 'MJ: Component Dependencies', isExpanded: false }
        ]);
    }
}

export function LoadComponentFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
