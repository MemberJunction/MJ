import { Component } from '@angular/core';
import { MJTourSurfaceEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Tour Surfaces') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtoursurface-form',
    templateUrl: './mjtoursurface.form.component.html'
})
export class MJTourSurfaceFormComponent extends BaseFormComponent {
    public record!: MJTourSurfaceEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'surfaceInformation', sectionName: 'Surface Information', isExpanded: true },
            { sectionKey: 'securityAndAccess', sectionName: 'Security and Access', isExpanded: true },
            { sectionKey: 'integrationsAndSettings', sectionName: 'Integrations and Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTourSurfaceTours', sectionName: 'Tour Surface Tours', isExpanded: false },
            { sectionKey: 'mJTourRuns', sectionName: 'Tour Runs', isExpanded: false }
        ]);
    }
}

