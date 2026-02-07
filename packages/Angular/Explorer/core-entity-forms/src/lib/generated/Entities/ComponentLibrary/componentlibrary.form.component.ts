import { Component } from '@angular/core';
import { ComponentLibraryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Component Libraries') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-componentlibrary-form',
    templateUrl: './componentlibrary.form.component.html'
})
export class ComponentLibraryFormComponent extends BaseFormComponent {
    public record!: ComponentLibraryEntity;

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

export function LoadComponentLibraryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
