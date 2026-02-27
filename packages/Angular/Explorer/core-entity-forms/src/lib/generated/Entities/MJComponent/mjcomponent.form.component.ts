import { Component } from '@angular/core';
import { MJComponentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Components') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcomponent-form',
    templateUrl: './mjcomponent.form.component.html'
})
export class MJComponentFormComponent extends BaseFormComponent {
    public record!: MJComponentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identificationVersioning', sectionName: 'Identification & Versioning', isExpanded: true },
            { sectionKey: 'specificationDesign', sectionName: 'Specification & Design', isExpanded: true },
            { sectionKey: 'developerOwnership', sectionName: 'Developer & Ownership', isExpanded: false },
            { sectionKey: 'registrySynchronization', sectionName: 'Registry & Synchronization', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJComponentDependenciesDependencyComponentID', sectionName: 'Component Dependencies (Dependency Component ID)', isExpanded: false },
            { sectionKey: 'mJComponentLibraryLinks', sectionName: 'Component Library Links', isExpanded: false },
            { sectionKey: 'mJComponentDependenciesComponentID', sectionName: 'Component Dependencies (Component ID)', isExpanded: false }
        ]);
    }
}

