import { Component } from '@angular/core';
import { EntityRelationshipDisplayComponentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEntityRelationshipDisplayComponentDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Entity Relationship Display Components') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entityrelationshipdisplaycomponent-form',
    templateUrl: './entityrelationshipdisplaycomponent.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityRelationshipDisplayComponentFormComponent extends BaseFormComponent {
    public record!: EntityRelationshipDisplayComponentEntity;
} 

export function LoadEntityRelationshipDisplayComponentFormComponent() {
    LoadEntityRelationshipDisplayComponentDetailsComponent();
}
