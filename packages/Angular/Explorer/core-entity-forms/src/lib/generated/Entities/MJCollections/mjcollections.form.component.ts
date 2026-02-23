import { Component } from '@angular/core';
import { MJCollectionsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Collections') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcollections-form',
    templateUrl: './mjcollections.form.component.html'
})
export class MJCollectionsFormComponent extends BaseFormComponent {
    public record!: MJCollectionsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'collectionBasics', sectionName: 'Collection Basics', isExpanded: true },
            { sectionKey: 'structuralHierarchy', sectionName: 'Structural Hierarchy', isExpanded: true },
            { sectionKey: 'ownershipAccess', sectionName: 'Ownership & Access', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJCollectionArtifacts', sectionName: 'MJ: Collection Artifacts', isExpanded: false },
            { sectionKey: 'mJCollectionPermissions', sectionName: 'MJ: Collection Permissions', isExpanded: false },
            { sectionKey: 'mJCollections', sectionName: 'MJ: Collections', isExpanded: false }
        ]);
    }
}

