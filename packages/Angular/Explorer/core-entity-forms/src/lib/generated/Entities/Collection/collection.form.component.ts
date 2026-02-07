import { Component } from '@angular/core';
import { CollectionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Collections') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-collection-form',
    templateUrl: './collection.form.component.html'
})
export class CollectionFormComponent extends BaseFormComponent {
    public record!: CollectionEntity;

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

export function LoadCollectionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
