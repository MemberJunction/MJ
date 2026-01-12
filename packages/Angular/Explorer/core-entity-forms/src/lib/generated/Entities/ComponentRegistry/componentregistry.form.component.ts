import { Component } from '@angular/core';
import { ComponentRegistryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Component Registries') // Tell MemberJunction about this class
@Component({
    selector: 'gen-componentregistry-form',
    templateUrl: './componentregistry.form.component.html'
})
export class ComponentRegistryFormComponent extends BaseFormComponent {
    public record!: ComponentRegistryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'registryCoreInfo', sectionName: 'Registry Core Info', isExpanded: true },
            { sectionKey: 'accessDetails', sectionName: 'Access Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJComponents', sectionName: 'MJ: Components', isExpanded: false }
        ]);
    }
}

export function LoadComponentRegistryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
