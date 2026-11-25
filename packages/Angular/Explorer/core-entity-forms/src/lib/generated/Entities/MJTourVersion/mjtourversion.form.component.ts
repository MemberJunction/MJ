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
            { sectionKey: 'versionDetails', sectionName: 'Version Details', isExpanded: true },
            { sectionKey: 'publishingInformation', sectionName: 'Publishing Information', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTourRuns', sectionName: 'Tour Runs', isExpanded: false },
            { sectionKey: 'mJTours', sectionName: 'Tours', isExpanded: false }
        ]);
    }
}

