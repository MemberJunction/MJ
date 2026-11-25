import { Component } from '@angular/core';
import { MJTourVersionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Tour Versions') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtourversion-form',
    templateUrl: './mjtourversion.form.component.html'
})
export class MJTourVersionFormComponent extends BaseFormComponent {
    public record!: MJTourVersionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tourDetails', sectionName: 'Tour Details', isExpanded: true },
            { sectionKey: 'versionDefinition', sectionName: 'Version Definition', isExpanded: true },
            { sectionKey: 'publicationDetails', sectionName: 'Publication Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTours', sectionName: 'Tours', isExpanded: false },
            { sectionKey: 'mJTourRuns', sectionName: 'Tour Runs', isExpanded: false }
        ]);
    }
}

