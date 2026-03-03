import { Component } from '@angular/core';
import { MJComponentLibraryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Component Libraries') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcomponentlibrary-form',
    templateUrl: './mjcomponentlibrary.form.component.html'
})
export class MJComponentLibraryFormComponent extends BaseFormComponent {
    public record!: MJComponentLibraryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'libraryIdentification', sectionName: 'Library Identification', isExpanded: true },
            { sectionKey: 'distributionAssets', sectionName: 'Distribution & Assets', isExpanded: true },
            { sectionKey: 'governanceDependencies', sectionName: 'Governance & Dependencies', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJComponentLibraryLinks', sectionName: 'MJ: Component Library Links', isExpanded: false }
        ]);
    }
}

