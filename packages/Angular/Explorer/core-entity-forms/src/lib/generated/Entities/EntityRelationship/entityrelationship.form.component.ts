import { Component } from '@angular/core';
import { EntityRelationshipEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Entity Relationships') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-entityrelationship-form',
    templateUrl: './entityrelationship.form.component.html'
})
export class EntityRelationshipFormComponent extends BaseFormComponent {
    public record!: EntityRelationshipEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'relationshipCore', sectionName: 'Relationship Core', isExpanded: true },
            { sectionKey: 'aPIQuerySettings', sectionName: 'API & Query Settings', isExpanded: true },
            { sectionKey: 'displayConfiguration', sectionName: 'Display Configuration', isExpanded: false },
            { sectionKey: 'technicalMetadata', sectionName: 'Technical Metadata', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

