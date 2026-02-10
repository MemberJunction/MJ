import { Component } from '@angular/core';
import { CollectionArtifactEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Collection Artifacts') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-collectionartifact-form',
    templateUrl: './collectionartifact.form.component.html'
})
export class CollectionArtifactFormComponent extends BaseFormComponent {
    public record!: CollectionArtifactEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'linkIdentifiers', sectionName: 'Link Identifiers', isExpanded: true },
            { sectionKey: 'linkDetails', sectionName: 'Link Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

