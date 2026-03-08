import { Component } from '@angular/core';
import { MJIntegrationObjectEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Integration Objects') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjintegrationobject-form',
    templateUrl: './mjintegrationobject.form.component.html'
})
export class MJIntegrationObjectFormComponent extends BaseFormComponent {
    public record!: MJIntegrationObjectEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'integrationContext', sectionName: 'Integration Context', isExpanded: true },
            { sectionKey: 'objectDefinition', sectionName: 'Object Definition', isExpanded: true },
            { sectionKey: 'aPIEndpointDetails', sectionName: 'API Endpoint Details', isExpanded: false },
            { sectionKey: 'syncAndPagination', sectionName: 'Sync and Pagination', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJIntegrationObjectFieldsIntegrationObjectID', sectionName: 'Integration Object Fields (Integration Object)', isExpanded: false },
            { sectionKey: 'mJIntegrationObjectFieldsRelatedIntegrationObjectID', sectionName: 'Integration Object Fields (Related Integration Object)', isExpanded: false }
        ]);
    }
}

