import { Component } from '@angular/core';
import { MJComponentsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Components') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcomponents-form',
    templateUrl: './mjcomponents.form.component.html'
})
export class MJComponentsFormComponent extends BaseFormComponent {
    public record!: MJComponentsEntity;

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

