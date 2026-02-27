import { Component } from '@angular/core';
import { MJComponentRegistryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Component Registries') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcomponentregistry-form',
    templateUrl: './mjcomponentregistry.form.component.html'
})
export class MJComponentRegistryFormComponent extends BaseFormComponent {
    public record!: MJComponentRegistryEntity;

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

