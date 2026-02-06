import { Component } from '@angular/core';
import { LibraryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Libraries') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-library-form',
    templateUrl: './library.form.component.html'
})
export class LibraryFormComponent extends BaseFormComponent {
    public record!: LibraryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'libraryIdentification', sectionName: 'Library Identification', isExpanded: true },
            { sectionKey: 'contentAvailability', sectionName: 'Content & Availability', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'actions', sectionName: 'Actions', isExpanded: false },
            { sectionKey: 'items', sectionName: 'Items', isExpanded: false }
        ]);
    }
}

export function LoadLibraryFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
