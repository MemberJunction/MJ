import { Component } from '@angular/core';
import { MJLibraryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Libraries') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjlibrary-form',
    templateUrl: './mjlibrary.form.component.html'
})
export class MJLibraryFormComponent extends BaseFormComponent {
    public record!: MJLibraryEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'libraryIdentification', sectionName: 'Library Identification', isExpanded: true },
            { sectionKey: 'contentAvailability', sectionName: 'Content & Availability', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJActionLibraries', sectionName: 'Actions', isExpanded: false },
            { sectionKey: 'mJLibraryItems', sectionName: 'Items', isExpanded: false }
        ]);
    }
}

