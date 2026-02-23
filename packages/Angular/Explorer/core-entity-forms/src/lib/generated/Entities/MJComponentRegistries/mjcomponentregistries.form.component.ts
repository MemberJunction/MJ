import { Component } from '@angular/core';
import { MJComponentRegistriesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Component Registries') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcomponentregistries-form',
    templateUrl: './mjcomponentregistries.form.component.html'
})
export class MJComponentRegistriesFormComponent extends BaseFormComponent {
    public record!: MJComponentRegistriesEntity;

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

