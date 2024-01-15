import { Component } from '@angular/core';
import { EntityRelationshipEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadEntityRelationshipDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Entity Relationships') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entityrelationship-form',
    templateUrl: './entityrelationship.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityRelationshipFormComponent extends BaseFormComponent {
    public record!: EntityRelationshipEntity;
} 

export function LoadEntityRelationshipFormComponent() {
    LoadEntityRelationshipDetailsComponent();
}
